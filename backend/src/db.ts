export type Conversation = { id: string; title: string; created_at: string; system_instruction?: string }

export async function buildEchoFromAncestors(
  db: D1Database,
  conversationId: string,
  fromNodeIds: string[],
  question: string,
): Promise<string> {
  const history = await listMessagesForNodeAncestors(db, conversationId, fromNodeIds, 20)
  const lines: string[] = []
  if (history.length) {
    lines.push('Echoing ancestors:')
    for (const m of history) {
      lines.push(`- ${m.author}: ${m.content}`)
    }
    lines.push('---')
  }
  lines.push(`Q: ${question}`)
  return lines.join('\n')
}
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

export async function updateConversationSystemInstruction(
  db: D1Database,
  conversationId: string,
  systemInstruction: string,
): Promise<Conversation | null> {
  const res = await db
    .prepare("UPDATE conversations SET system_instruction = ? WHERE id = ? RETURNING id, title, created_at, system_instruction")
    .bind(systemInstruction, conversationId)
    .first<Conversation>()
  return res || null
}

export async function listConversations(db: D1Database): Promise<Conversation[]> {
  const res = await db.prepare("SELECT id, title, created_at, system_instruction FROM conversations ORDER BY created_at DESC").all<Conversation>()
  return (res.results || []) as Conversation[]
}

export async function getConversationById(db: D1Database, conversationId: string): Promise<Conversation | null> {
  const res = await db
    .prepare("SELECT id, title, created_at, system_instruction FROM conversations WHERE id = ?")
    .bind(conversationId)
    .first<Conversation>()
  return res || null
}

export async function updateConversationTitle(db: D1Database, conversationId: string, title: string): Promise<Conversation | null> {
  const res = await db
    .prepare("UPDATE conversations SET title = ? WHERE id = ? RETURNING id, title, created_at, system_instruction")
    .bind(title, conversationId)
    .first<Conversation>()
  return res || null
}

// not used
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

export async function listMessagesForNodeAncestors(
  db: D1Database,
  conversationId: string,
  fromNodeIds: string[],
  limit = 20,
): Promise<Message[]> {
  if (!fromNodeIds.length) {
    return []
  }
  const nodesRes = await db
    .prepare('SELECT id, message_id FROM nodes WHERE conversation_id = ?')
    .bind(conversationId)
    .all<{ id: string; message_id: string | null }>()
  const edgesRes = await db
    .prepare('SELECT source, target FROM edges WHERE conversation_id = ?')
    .bind(conversationId)
    .all<{ source: string; target: string }>()

  const nodes = (nodesRes.results || []) as { id: string; message_id: string | null }[]
  const edges = (edgesRes.results || []) as { source: string; target: string }[]

  if (!nodes.length) {
    return []
  }

  const incoming = new Map<string, string[]>()
  for (const edge of edges) {
    const list = incoming.get(edge.target) ?? []
    list.push(edge.source)
    incoming.set(edge.target, list)
  }

  const visited = new Set<string>()
  const stack: string[] = [...fromNodeIds]
  const ancestorNodeIds: string[] = []

  while (stack.length) {
    const current = stack.pop() as string
    if (visited.has(current)) continue
    visited.add(current)
    ancestorNodeIds.push(current)
    const parents = incoming.get(current)
    if (parents) {
      for (const parentId of parents) {
        if (!visited.has(parentId)) {
          stack.push(parentId)
        }
      }
    }
  }

  if (!ancestorNodeIds.length) {
    return []
  }

  const nodeById = new Map<string, { id: string; message_id: string | null }>()
  for (const node of nodes) {
    nodeById.set(node.id, node)
  }

  const messageIds: string[] = []
  for (const nodeId of ancestorNodeIds) {
    const node = nodeById.get(nodeId)
    if (node?.message_id) {
      messageIds.push(node.message_id)
    }
  }

  if (!messageIds.length) {
    return []
  }

  const placeholders = messageIds.map(() => '?').join(',')
  const res = await db
    .prepare(
      `SELECT id, conversation_id, author, content, created_at FROM messages WHERE conversation_id = ? AND id IN (${placeholders}) ORDER BY created_at ASC`,
    )
    .bind(conversationId, ...messageIds)
    .all<Message>()

  const results = (res.results || []) as Message[]
  if (results.length <= limit) {
    return results
  }
  return results.slice(results.length - limit)
}

export async function deleteNodeSubtreeRespectingJoins(
  db: D1Database,
  conversationId: string,
  rootNodeId: string,
): Promise<{ deletedNodeIds: string[] }> {
  const nodesRes = await db
    .prepare('SELECT id, message_id FROM nodes WHERE conversation_id = ?')
    .bind(conversationId)
    .all<{ id: string; message_id: string | null }>()
  const edgesRes = await db
    .prepare('SELECT source, target FROM edges WHERE conversation_id = ?')
    .bind(conversationId)
    .all<{ source: string; target: string }>()

  const nodes = (nodesRes.results || []) as { id: string; message_id: string | null }[]
  const edges = (edgesRes.results || []) as { source: string; target: string }[]

  if (!nodes.length) {
    return { deletedNodeIds: [] }
  }

  const nodeIds = new Set(nodes.map((n) => n.id))
  if (!nodeIds.has(rootNodeId)) {
    return { deletedNodeIds: [] }
  }

  const outgoing = new Map<string, string[]>()
  const incomingCount = new Map<string, number>()

  for (const edge of edges) {
    const outList = outgoing.get(edge.source) ?? []
    outList.push(edge.target)
    outgoing.set(edge.source, outList)

    const currentIn = incomingCount.get(edge.target) ?? 0
    incomingCount.set(edge.target, currentIn + 1)
  }

  const toDelete = new Set<string>()
  const stack: string[] = [rootNodeId]

  while (stack.length) {
    const current = stack.pop() as string
    if (toDelete.has(current)) continue
    toDelete.add(current)

    const children = outgoing.get(current)
    if (!children) continue

    for (const child of children) {
      const indegree = incomingCount.get(child) ?? 0
      if (indegree > 1) {
        continue
      }
      if (!toDelete.has(child)) {
        stack.push(child)
      }
    }
  }

  const deletedNodeIds = Array.from(toDelete)
  if (!deletedNodeIds.length) {
    return { deletedNodeIds: [] }
  }

  const nodeById = new Map<string, { id: string; message_id: string | null }>()
  for (const node of nodes) {
    nodeById.set(node.id, node)
  }

  const messageIds: string[] = []
  for (const nodeId of deletedNodeIds) {
    const node = nodeById.get(nodeId)
    if (node?.message_id) {
      messageIds.push(node.message_id)
    }
  }

  if (messageIds.length) {
    const msgPlaceholders = messageIds.map(() => '?').join(',')
    await db
      .prepare(
        `DELETE FROM messages WHERE conversation_id = ? AND id IN (${msgPlaceholders})`,
      )
      .bind(conversationId, ...messageIds)
      .run()
  }

  const nodePlaceholders = deletedNodeIds.map(() => '?').join(',')
  await db
    .prepare(
      `DELETE FROM nodes WHERE conversation_id = ? AND id IN (${nodePlaceholders})`,
    )
    .bind(conversationId, ...deletedNodeIds)
    .run()

  return { deletedNodeIds }
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

export async function createMessageWithAI(
  db: D1Database,
  conversationId: string,
  content: string,
  fromNodeIds?: string[] | null,
  aiOverrideContent?: string | null,
  draftNodeId?: string | null,
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

  // Previous nodes for this conversation, if any. If fromNodeIds are provided use them,
  // otherwise leave this message pair as a new starting point with no parent edge.
  let prevNodeIds: string[] = []

  if (fromNodeIds && fromNodeIds.length) {
    const placeholders = fromNodeIds.map(() => '?').join(',')
    const prevRes = await db
      .prepare(
        `SELECT id FROM nodes WHERE conversation_id = ? AND id IN (${placeholders})`,
      )
      .bind(conversationId, ...fromNodeIds)
      .all<{ id: string }>()
    prevNodeIds = ((prevRes.results || []) as { id: string }[]).map((r) => r.id)
  }

  const userNode: GraphNode = {
    id: draftNodeId || crypto.randomUUID(),
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

  for (const prevNodeId of prevNodeIds) {
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

export async function editUserNodeContent(
  db: D1Database,
  conversationId: string,
  nodeId: string,
  newContent: string,
): Promise<{ updatedNode: GraphNode }> {
  // 1. Get the node to verify it exists and is a user node
  const node = await db
    .prepare('SELECT * FROM nodes WHERE conversation_id = ? AND id = ?')
    .bind(conversationId, nodeId)
    .first<GraphNode>()

  if (!node || node.type !== 'user') {
    throw new Error('Node not found or not a user node')
  }

  // 2. Update the message content
  if (node.message_id) {
    await db
      .prepare('UPDATE messages SET content = ? WHERE id = ? AND conversation_id = ?')
      .bind(newContent, node.message_id, conversationId)
      .run()
  }

  // 3. Update the node label
  await db
    .prepare('UPDATE nodes SET label = ? WHERE id = ? AND conversation_id = ?')
    .bind(newContent, nodeId, conversationId)
    .run()

  // 4. Find children (outgoing edges)
  const edgesRes = await db
    .prepare('SELECT target FROM edges WHERE conversation_id = ? AND source = ?')
    .bind(conversationId, nodeId)
    .all<{ target: string }>()

  const children = (edgesRes.results || []) as { target: string }[]

  // 5. Delete children subtrees
  for (const child of children) {
    await deleteNodeSubtreeRespectingJoins(db, conversationId, child.target)
  }

  return { updatedNode: { ...node, label: newContent } }
}

export async function addAiResponseNode(
  db: D1Database,
  conversationId: string,
  parentNodeId: string,
  aiContent: string,
): Promise<{ aiMessage: Message; aiNode: GraphNode; edge: GraphEdge }> {
  const now = new Date().toISOString()

  const aiMessage: Message = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    author: 'ai',
    content: aiContent,
    created_at: now,
  }

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

  const aiNode: GraphNode = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    message_id: aiMessage.id,
    type: 'ai',
    label: aiContent,
    created_at: now,
    pos_x: null,
    pos_y: null,
  }

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

  const edge: GraphEdge = {
    id: crypto.randomUUID(),
    conversation_id: conversationId,
    source: parentNodeId,
    target: aiNode.id,
    created_at: now,
  }

  await db
    .prepare(
      'INSERT INTO edges (id, conversation_id, source, target, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    .bind(edge.id, edge.conversation_id, edge.source, edge.target, edge.created_at)
    .run()

  return { aiMessage, aiNode, edge }
}
