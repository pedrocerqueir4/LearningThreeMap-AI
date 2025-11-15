export type Conversation = { id: string; title: string; created_at: string }
export type GraphNode = { id: string; conversation_id: string; message_id: string | null; type: 'user' | 'ai'; label: string; created_at: string }
export type GraphEdge = { id: string; conversation_id: string; source: string; target: string; created_at: string }

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

export async function getGraph(db: D1Database, conversationId: string): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
  const nodesRes = await db.prepare("SELECT id, conversation_id, message_id, type, label, created_at FROM nodes WHERE conversation_id = ?").bind(conversationId).all<GraphNode>()
  const edgesRes = await db.prepare("SELECT id, conversation_id, source, target, created_at FROM edges WHERE conversation_id = ?").bind(conversationId).all<GraphEdge>()
  return {
    nodes: (nodesRes.results || []) as GraphNode[],
    edges: (edgesRes.results || []) as GraphEdge[],
  }
}
