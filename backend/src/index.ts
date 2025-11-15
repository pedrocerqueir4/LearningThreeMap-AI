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
import { createConversation, listConversations, getGraph } from './db'

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

app.get('/api/graph/:conversationId', async (c) => {
  const conversationId = c.req.param('conversationId')
  const graph = await getGraph(c.env.DB, conversationId)
  return c.json(graph)
})

// Export para Cloudflare Worker
export default app
