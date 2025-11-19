export type Conversation = { id: string; title: string; created_at: string }
export type Message = {
  id: string
  conversation_id: string
  author: 'user' | 'ai'
  content: string
  created_at: string
}
export type GraphNode = {
  id: string
  conversation_id: string
  message_id: string | null
  type: 'user' | 'ai'
  label: string
  created_at: string
  pos_x: number | null
  pos_y: number | null
}
export type GraphEdge = {
  id: string
  conversation_id: string
  source: string
  target: string
  created_at: string
}
export type GraphDelta = { newNodes: GraphNode[]; newEdges: GraphEdge[] }
export type NodePositionUpdate = { nodeId: string; x: number; y: number }

export async function createConversation(db: D1Database, title: string): Promise<Conversation> {
  const id = crypto.randomUUID()
  const created_at = new Date().toISOString()
  await db.prepare("INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)").bind(id, title, created_at).run()
  return { id, title, created_at }
}

export async function listConversations(db: D1Database): Promise<Conversation[]> {
  const res = await db.prepare("SELECT id, title, created_at FROM conversations ORDER BY created_at DESC").all<Conversation>()
  return (res.results || []) as Conversation[]
}

export async function listMessagesForConversation(
  db: D1Database,
  conversationId: string,
  limit = 20,
): Promise<Message[]> {
  const res = await db
    .prepare(
      'SELECT id, conversation_id, author, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?',
    )
    .bind(conversationId, limit)
    .all<Message>()
  return (res.results || []) as Message[]
}

export async function getGraph(db: D1Database, conversationId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const nodesRes = await db
    .prepare(
      'SELECT id, conversation_id, message_id, type, label, created_at, pos_x, pos_y FROM nodes WHERE conversation_id = ?',
    )
    .bind(conversationId)
    .all<GraphNode>()
  const edgesRes = await db
    .prepare('SELECT id, conversation_id, source, target, created_at FROM edges WHERE conversation_id = ?')
    .bind(conversationId)
    .all<GraphEdge>()
  return {
    nodes: (nodesRes.results || []) as GraphNode[],
    edges: (edgesRes.results || []) as GraphEdge[],
  }
}

export async function updateNodePositions(
  db: D1Database,
  conversationId: string,
  positions: NodePositionUpdate[],
): Promise<void> {
  if (!positions.length) return
  for (const { nodeId, x, y } of positions) {
    await db
      .prepare('UPDATE nodes SET pos_x = ?, pos_y = ? WHERE id = ? AND conversation_id = ?')
      .bind(x, y, nodeId, conversationId)
      .run()
  }
}

export async function deleteConversation(db: D1Database, conversationId: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM conversations WHERE id = ?').bind(conversationId).run()
  const changes = (result as { meta?: { changes?: number } }).meta?.changes ?? 0
  return changes > 0
}

export async function createMessageWithDummyAI(
  db: D1Database,
  conversationId: string,
  content: string,
  fromNodeId?: string | null,
  aiOverrideContent?: string | null,
): Promise<{ userMessage: Message; aiMessage: Message; graphDelta: GraphDelta }> {
  const now = new Date().toISOString()

  const userMessage: Message = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    author: 'user',
    content,
    created_at: now,
  }

  const aiContent = aiOverrideContent ?? `Echo: ${content}`
  const aiMessage: Message = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    author: 'ai',
    content: aiContent,
    created_at: new Date().toISOString(),
  }

  // Persist messages
  await db
    .prepare(
      'INSERT INTO messages (id, conversation_id, author, content, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(
      userMessage.id,
      userMessage.conversation_id,
      userMessage.author,
      userMessage.content,
      userMessage.created_at,
    )
    .run()

  await db
    .prepare(
      'INSERT INTO messages (id, conversation_id, author, content, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(
      aiMessage.id,
      aiMessage.conversation_id,
      aiMessage.author,
      aiMessage.content,
      aiMessage.created_at,
    )
    .run()

  // Previous node for this conversation, if any. If a fromNodeId is provided use that,
  // otherwise leave this message pair as a new starting point with no parent edge.
  let prevNodeId: string | null = null

  if (fromNodeId) {
    const specificPrev = await db
      .prepare('SELECT id FROM nodes WHERE id = ? AND conversation_id = ?')
      .bind(fromNodeId, conversationId)
      .first<{ id: string } | null>()
    prevNodeId = specificPrev?.id ?? null
  }

  const userNode: GraphNode = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    message_id: userMessage.id,
    type: 'user',
    label: content,
    created_at: now,
    pos_x: null,
    pos_y: null,
  }

  const aiNode: GraphNode = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    message_id: aiMessage.id,
    type: 'ai',
    label: aiContent,
    created_at: new Date().toISOString(),
    pos_x: null,
    pos_y: null,
  }

  await db
    .prepare(
      'INSERT INTO nodes (id, conversation_id, message_id, type, label, created_at, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      userNode.id,
      userNode.conversation_id,
      userNode.message_id,
      userNode.type,
      userNode.label,
      userNode.created_at,
      userNode.pos_x,
      userNode.pos_y,
    )
    .run()

  await db
    .prepare(
      'INSERT INTO nodes (id, conversation_id, message_id, type, label, created_at, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      aiNode.id,
      aiNode.conversation_id,
      aiNode.message_id,
      aiNode.type,
      aiNode.label,
      aiNode.created_at,
      aiNode.pos_x,
      aiNode.pos_y,
    )
    .run()

  const newEdges: GraphEdge[] = []

  if (prevNodeId) {
    const edgeFromPrevToUser: GraphEdge = {
      id: crypto.randomUUID(),
      conversation_id: conversationId,
      source: prevNodeId,
      target: userNode.id,
      created_at: new Date().toISOString(),
    }
    newEdges.push(edgeFromPrevToUser)
  }

  const edgeUserToAi: GraphEdge = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    source: userNode.id,
    target: aiNode.id,
    created_at: new Date().toISOString(),
  }

  newEdges.push(edgeUserToAi)

  for (const edge of newEdges) {
    await db
      .prepare(
        'INSERT INTO edges (id, conversation_id, source, target, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .bind(edge.id, edge.conversation_id, edge.source, edge.target, edge.created_at)
      .run()
  }

  const graphDelta: GraphDelta = {
    newNodes: [userNode, aiNode],
    newEdges,
  }

  return { userMessage, aiMessage, graphDelta }
}
