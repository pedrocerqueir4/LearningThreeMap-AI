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
  createMessageWithAI,
  deleteConversation,
  updateNodePositions,
  listMessagesForConversation,
  listMessagesForNodeAncestors,
  deleteNodeSubtreeRespectingJoins,
  buildEchoFromAncestors,
  updateConversationTitle,
  getConversationById,
} from './db'

type Bindings = { DB: D1Database; AI_API_KEY?: string }

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

app.put('/api/conversations/:conversationId', async (c) => {
  const conversationId = c.req.param('conversationId')
  if (!conversationId) {
    return c.json({ error: 'conversationId is required' }, 400)
  }

  const body = await c.req.json().catch(() => ({})) as { title?: string }
  const title = typeof body?.title === 'string' && body.title.trim().length > 0 ? body.title.trim() : null

  if (!title) {
    return c.json({ error: 'title is required' }, 400)
  }

  const updated = await updateConversationTitle(c.env.DB, conversationId, title)
  if (!updated) {
    return c.json({ error: 'Conversation not found' }, 404)
  }

  return c.json(updated)
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
    fromNodeIds?: string[]
  }

  const conversationId = body.conversationId?.trim()
  const content = body.content?.trim()
  const rawFromNodeIds = Array.isArray(body.fromNodeIds) ? body.fromNodeIds : []
  const fromNodeIds = rawFromNodeIds
    .map((id) => (typeof id === 'string' ? id.trim() : ''))
    .filter((id) => id.length > 0)

  if (!conversationId || !content) {
    return c.json({ error: 'conversationId and content are required' }, 400)
  }

  // If no API key is configured, fall back to the simple echo behavior.
  const apiKey = c.env.AI_API_KEY
  if (!apiKey) {
    let aiEcho = `Echo: ${content}`
    try {
      if (fromNodeIds.length) {
        aiEcho = await buildEchoFromAncestors(c.env.DB, conversationId, fromNodeIds, content)
      }
    } catch (e) {
    }
    const result = await createMessageWithAI(c.env.DB, conversationId, content, fromNodeIds, aiEcho)
    return c.json(result, 201)
  }

  // Load graph-aware conversation history for context (best-effort).
  // If fromNodeIds are provided, we only use messages attached to nodes
  // that are ancestors of those nodes in the graph. For root questions
  // (no fromNodeIds), we send the question without prior history.
  let history: Awaited<ReturnType<typeof listMessagesForConversation>> = []
  try {
    if (fromNodeIds.length) {
      history = await listMessagesForNodeAncestors(c.env.DB, conversationId, fromNodeIds, 20)
    } else {
      history = []
    }
  } catch (err) {
    console.error('Failed to load message history for AI:', err)
  }

  // Build Google Gemini contents from history and current user message
  const systemInstruction = 'You are a helpful learning assistant. Answer concisely and clearly, focusing on the user question.'
  const geminiContents = [
    ...history.map((m) => ({
      role: m.author === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: content }] },
  ] as { role: 'user' | 'model'; parts: { text: string }[] }[]

  const callAiOnce = async () => {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        /*config: {
          systemInstruction: systemInstruction,
        },*/
        contents: geminiContents,
      }),
    })

    if (!response.ok) {
      const errBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
      const msg = errBody?.error?.message ?? `AI request failed with status ${response.status}`
      throw new Error(msg)
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const aiText = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim()
    if (!aiText) {
      throw new Error('AI returned an empty response')
    }
    return aiText
  }

  let aiContent: string
  try {
    aiContent = await callAiOnce()
  } catch (firstError) {
    console.error('AI call failed (first attempt):', firstError)
    try {
      aiContent = await callAiOnce()
    } catch (secondError) {
      console.error('AI call failed (second attempt):', secondError)
      return c.json({ error: 'Failed to generate AI response. Please try again.' }, 500)
    }
  }

  const result = await createMessageWithAI(c.env.DB, conversationId, content, fromNodeIds, aiContent)
  // Try to auto-generate a short conversation title (1–6 words) after the first AI answer,
  // but only if the title is still the default placeholder.
  try {
    const conversation = await getConversationById(c.env.DB, conversationId)
    if (conversation && (conversation.title.toUpperCase() === 'New conversation'.toUpperCase())) {
      const titlePrompt =
        'Generate a short, clear title (1 to 3 words) for this learning conversation. ' +
        'Return only the title text without quotes.\n\n' +
        `User question:\n${content}\n\n` +
        `AI answer:\n${aiContent}`

      const titleResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: titlePrompt }] }],
          }),
        },
      )

      if (titleResponse.ok) {
        const titleData = (await titleResponse.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[]
        }
        let generatedTitle =
          titleData.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? ''

        if (generatedTitle) {
          generatedTitle = generatedTitle.replace(/\s+/g, ' ')
          const words = generatedTitle.split(' ').filter(Boolean).slice(0, 3)
          generatedTitle = words.join(' ')
        } else {
          generatedTitle = 'New conversation'
        }

        await updateConversationTitle(c.env.DB, conversationId, generatedTitle)
      }
    }
  } catch (err) {
    console.error('Failed to auto-generate conversation title:', err)
  }

  return c.json(result, 201)
})

app.delete('/api/graph/:conversationId/nodes/:nodeId', async (c) => {
  const conversationId = c.req.param('conversationId')
  const nodeId = c.req.param('nodeId')

  if (!conversationId || !nodeId) {
    return c.json({ error: 'conversationId and nodeId are required' }, 400)
  }

  const { deletedNodeIds } = await deleteNodeSubtreeRespectingJoins(
    c.env.DB,
    conversationId,
    nodeId,
  )

  return c.json({ deletedNodeIds })
})

// Export para Cloudflare Worker
export default app
