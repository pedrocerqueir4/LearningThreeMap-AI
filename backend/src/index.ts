/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { Hono } from 'hono'
import {
  createConversation,
  listConversations,
  getGraph,
  createMessageWithDummyAI,
  deleteConversation,
  updateNodePositions,
} from './db'

type Bindings = { DB: D1Database }

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => c.text('Hello World!'))

app.post('/api/conversations', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { title?: string }
  const title = typeof body?.title === 'string' && body.title.trim().length > 0 ? body.title.trim() : 'New Conversation'
  const created = await createConversation(c.env.DB, title)
  return c.json(created, 201)
})

app.get('/api/conversations', async (c) => {
  const list = await listConversations(c.env.DB)
  return c.json(list)
})

app.delete('/api/conversations/:conversationId', async (c) => {
  const conversationId = c.req.param('conversationId')
  if (!conversationId) {
    return c.json({ error: 'conversationId is required' }, 400)
  }

  const deleted = await deleteConversation(c.env.DB, conversationId)
  if (!deleted) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  return c.body(null, 204)
})

app.get('/api/graph/:conversationId', async (c) => {
  const conversationId = c.req.param('conversationId')
  const graph = await getGraph(c.env.DB, conversationId)
  return c.json(graph)
})

app.post('/api/graph/:conversationId/positions', async (c) => {
  const conversationId = c.req.param('conversationId')

  if (!conversationId) {
    return c.json({ error: 'conversationId is required' }, 400)
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    positions?: { nodeId?: string; x?: number; y?: number }[]
  }

  const rawPositions = Array.isArray(body.positions) ? body.positions : []

  const positions = rawPositions
    .map((p) => {
      const nodeId = typeof p?.nodeId === 'string' ? p.nodeId.trim() : ''
      const x = typeof p?.x === 'number' ? p.x : null
      const y = typeof p?.y === 'number' ? p.y : null
      if (!nodeId || x === null || y === null) return null
      return { nodeId, x, y }
    })
    .filter((p): p is { nodeId: string; x: number; y: number } => p !== null)

  if (!positions.length) {
    return c.json({ updated: 0 })
  }

  await updateNodePositions(c.env.DB, conversationId, positions)

  return c.json({ updated: positions.length })
})

app.post('/api/messages', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    conversationId?: string
    content?: string
    fromNodeId?: string
  }

  const conversationId = body.conversationId?.trim()
  const content = body.content?.trim()
  const fromNodeId = body.fromNodeId?.trim() || null

  if (!conversationId || !content) {
    return c.json({ error: 'conversationId and content are required' }, 400)
  }

  const result = await createMessageWithDummyAI(c.env.DB, conversationId, content, fromNodeId)
  return c.json(result, 201)
})

// Export para Cloudflare Worker
export default app
