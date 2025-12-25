import { insertMessage, insertNode, insertEdge, createMessage, createNode, createEdge, fetchGraphStructure } from './db-helpers'

export type Conversation = {
  id: string
  title: string
  created_at: string
  system_instruction?: string
  viewport_x?: number | null
  viewport_y?: number | null
  viewport_zoom?: number | null
}

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
  context_ranges: ContextRange[] | null
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
  context_ranges: ContextRange[] | null
}
export type GraphEdge = {
  id: string
  conversation_id: string
  source: string
  target: string
  created_at: string
}
export type ContextRange = {
  sourceNodeId: string
  startPos: number
  endPos: number
  sourceStartPos?: number  // Position in source node's AI text where context was extracted
  sourceEndPos?: number    // End position in source node's AI text
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
    .prepare("UPDATE conversations SET system_instruction = ? WHERE id = ? RETURNING id, title, created_at, system_instruction, viewport_x, viewport_y, viewport_zoom")
    .bind(systemInstruction, conversationId)
    .first<Conversation>()
  return res || null
}

export async function listConversations(db: D1Database): Promise<Conversation[]> {
  const res = await db.prepare("SELECT id, title, created_at, system_instruction, viewport_x, viewport_y, viewport_zoom FROM conversations ORDER BY created_at DESC").all<Conversation>()
  return (res.results || []) as Conversation[]
}

export async function getConversationById(db: D1Database, conversationId: string): Promise<Conversation | null> {
  const res = await db
    .prepare("SELECT id, title, created_at, system_instruction, viewport_x, viewport_y, viewport_zoom FROM conversations WHERE id = ?")
    .bind(conversationId)
    .first<Conversation>()
  return res || null
}

export async function updateConversationTitle(db: D1Database, conversationId: string, title: string): Promise<Conversation | null> {
  const res = await db
    .prepare("UPDATE conversations SET title = ? WHERE id = ? RETURNING id, title, created_at, system_instruction, viewport_x, viewport_y, viewport_zoom")
    .bind(title, conversationId)
    .first<Conversation>()
  return res || null
}

export async function updateConversationViewport(
  db: D1Database,
  conversationId: string,
  x: number,
  y: number,
  zoom: number,
): Promise<Conversation | null> {
  const res = await db
    .prepare(
      "UPDATE conversations SET viewport_x = ?, viewport_y = ?, viewport_zoom = ? WHERE id = ? RETURNING id, title, created_at, system_instruction, viewport_x, viewport_y, viewport_zoom"
    )
    .bind(x, y, zoom, conversationId)
    .first<Conversation>()
  return res || null
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

  const { nodes, edges } = await fetchGraphStructure(db, conversationId)

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
  const { nodes, edges } = await fetchGraphStructure(db, conversationId)

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
  // Join nodes with messages to get context_ranges
  const nodesRes = await db
    .prepare(
      `SELECT 
        n.id, n.conversation_id, n.message_id, n.type, n.label, n.created_at, n.pos_x, n.pos_y,
        m.context_ranges as context_ranges_json
      FROM nodes n
      LEFT JOIN messages m ON n.message_id = m.id
      WHERE n.conversation_id = ?`,
    )
    .bind(conversationId)
    .all<{
      id: string
      conversation_id: string
      message_id: string | null
      type: 'user' | 'ai'
      label: string
      created_at: string
      pos_x: number | null
      pos_y: number | null
      context_ranges_json: string | null
    }>()

  // Parse context_ranges JSON for each node
  const nodes: GraphNode[] = (nodesRes.results || []).map((row) => {
    let context_ranges: ContextRange[] | null = null
    if (row.context_ranges_json) {
      try {
        context_ranges = JSON.parse(row.context_ranges_json) as ContextRange[]
      } catch {
        context_ranges = null
      }
    }
    return {
      id: row.id,
      conversation_id: row.conversation_id,
      message_id: row.message_id,
      type: row.type,
      label: row.label,
      created_at: row.created_at,
      pos_x: row.pos_x,
      pos_y: row.pos_y,
      context_ranges,
    }
  })

  const edgesRes = await db
    .prepare('SELECT id, conversation_id, source, target, created_at FROM edges WHERE conversation_id = ?')
    .bind(conversationId)
    .all<GraphEdge>()
  return {
    nodes,
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
  position?: { x: number; y: number } | null,
  contextRanges?: ContextRange[] | null,
): Promise<{ userMessage: Message; aiMessage: Message; graphDelta: GraphDelta }> {
  const userMessage = createMessage(conversationId, 'user', content, contextRanges)
  const aiContent = aiOverrideContent ?? `Echo: ${content}`
  const aiMessage = createMessage(conversationId, 'ai', aiContent)

  // Persist messages
  await insertMessage(db, userMessage)
  await insertMessage(db, aiMessage)

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

  // Use draftNodeId if provided, otherwise create new node
  let userNode: GraphNode
  let userNodeIsNew = true

  if (draftNodeId) {
    // Verify draft node exists
    const existingDraft = await db
      .prepare('SELECT * FROM nodes WHERE id = ? AND conversation_id = ?')
      .bind(draftNodeId, conversationId)
      .first<GraphNode>()

    if (existingDraft) {
      // Update existing draft node
      await db
        .prepare('UPDATE nodes SET message_id = ?, label = ? WHERE id = ? AND conversation_id = ?')
        .bind(userMessage.id, content, draftNodeId, conversationId)
        .run()

      userNode = createNode(conversationId, userMessage.id, 'user', content)
      userNode.id = draftNodeId
      userNode.pos_x = existingDraft.pos_x
      userNode.pos_y = existingDraft.pos_y
      userNodeIsNew = false
    } else {
      // Draft node doesn't exist, create new one
      userNode = createNode(conversationId, userMessage.id, 'user', content)
      if (position) {
        userNode.pos_x = position.x
        userNode.pos_y = position.y
      }
      await insertNode(db, userNode)
      userNodeIsNew = true
    }
  } else {
    userNode = createNode(conversationId, userMessage.id, 'user', content)
    if (position) {
      userNode.pos_x = position.x
      userNode.pos_y = position.y
    }
    await insertNode(db, userNode)
    userNodeIsNew = true
  }

  const aiNode = createNode(conversationId, aiMessage.id, 'ai', aiContent)
  // Inherit position from user node so the pair stays in place
  aiNode.pos_x = userNode.pos_x
  aiNode.pos_y = userNode.pos_y

  await insertNode(db, aiNode)

  const newEdges: GraphEdge[] = []

  // Only create edges from previous nodes to user node if user node is new
  if (userNodeIsNew && prevNodeIds.length > 0) {
    for (const prevNodeId of prevNodeIds) {
      const edgeFromPrevToUser = createEdge(conversationId, prevNodeId, userNode.id)
      newEdges.push(edgeFromPrevToUser)
      await insertEdge(db, edgeFromPrevToUser)
    }
  }

  const edgeUserToAi = createEdge(conversationId, userNode.id, aiNode.id)
  newEdges.push(edgeUserToAi)
  await insertEdge(db, edgeUserToAi)

  const graphDelta: GraphDelta = {
    newNodes: userNodeIsNew ? [userNode, aiNode] : [aiNode],
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
  const aiMessage = createMessage(conversationId, 'ai', aiContent)
  await insertMessage(db, aiMessage)

  const aiNode = createNode(conversationId, aiMessage.id, 'ai', aiContent)
  await insertNode(db, aiNode)

  const edge = createEdge(conversationId, parentNodeId, aiNode.id)
  await insertEdge(db, edge)

  return { aiMessage, aiNode, edge }
}
