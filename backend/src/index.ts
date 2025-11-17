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
