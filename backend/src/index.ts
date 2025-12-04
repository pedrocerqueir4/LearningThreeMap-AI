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
  listMessagesForNodeAncestors,
  deleteNodeSubtreeRespectingJoins,
  buildEchoFromAncestors,
  updateConversationTitle,
  getConversationById,
  updateConversationSystemInstruction,
  editUserNodeContent,
  addAiResponseNode,
} from './db'
import { generateAIResponse, getSystemInstruction, buildGeminiContents, generateConversationTitle } from './ai-service'
import { validateConversationId, validateContent, validateTitle, parseNodeIds, parsePositions } from './validation'
import { DEFAULT_CONVERSATION_TITLE, ERROR_MESSAGES } from './constants'

type Bindings = { DB: D1Database; AI_API_KEY?: string }

const app = new Hono<{ Bindings: Bindings }>()

app.get('/', (c) => c.text('Hello World!'))

app.post('/api/conversations', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { title?: string }
  const title = validateTitle(body?.title) || DEFAULT_CONVERSATION_TITLE
  const created = await createConversation(c.env.DB, title)
  return c.json(created, 201)
})

app.get('/api/conversations', async (c) => {
  const list = await listConversations(c.env.DB)
  return c.json(list)
})

app.put('/api/conversations/:conversationId', async (c) => {
  const conversationId = validateConversationId(c.req.param('conversationId'))
  if (!conversationId) {
    return c.json({ error: ERROR_MESSAGES.CONVERSATION_ID_REQUIRED }, 400)
  }

  const body = await c.req.json().catch(() => ({})) as { title?: string }
  const title = validateTitle(body?.title)

  if (!title) {
    return c.json({ error: ERROR_MESSAGES.TITLE_REQUIRED }, 400)
  }

  const updated = await updateConversationTitle(c.env.DB, conversationId, title)
  if (!updated) {
    return c.json({ error: ERROR_MESSAGES.CONVERSATION_NOT_FOUND }, 404)
  }

  return c.json(updated)
})

app.put('/api/conversations/:conversationId/agent', async (c) => {
  const conversationId = validateConversationId(c.req.param('conversationId'))
  if (!conversationId) {
    return c.json({ error: ERROR_MESSAGES.CONVERSATION_ID_REQUIRED }, 400)
  }

  const body = await c.req.json().catch(() => ({})) as { systemInstruction?: string }
  const systemInstruction = validateTitle(body?.systemInstruction, true) || ''

  const updated = await updateConversationSystemInstruction(c.env.DB, conversationId, systemInstruction)
  if (!updated) {
    return c.json({ error: ERROR_MESSAGES.CONVERSATION_NOT_FOUND }, 404)
  }

  return c.json(updated)
})

app.delete('/api/conversations/:conversationId', async (c) => {
  const conversationId = validateConversationId(c.req.param('conversationId'))
  if (!conversationId) {
    return c.json({ error: ERROR_MESSAGES.CONVERSATION_ID_REQUIRED }, 400)
  }

  const deleted = await deleteConversation(c.env.DB, conversationId)
  if (!deleted) {
    return c.json({ error: ERROR_MESSAGES.CONVERSATION_NOT_FOUND }, 404)
  }

  return c.body(null, 204)
})

app.get('/api/graph/:conversationId', async (c) => {
  const conversationId = c.req.param('conversationId')
  const graph = await getGraph(c.env.DB, conversationId)
  return c.json(graph)
})

app.post('/api/graph/:conversationId/positions', async (c) => {
  const conversationId = validateConversationId(c.req.param('conversationId'))

  if (!conversationId) {
    return c.json({ error: ERROR_MESSAGES.CONVERSATION_ID_REQUIRED }, 400)
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    positions?: { nodeId?: string; x?: number; y?: number }[]
  }

  const positions = parsePositions(body.positions)

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
    draftNodeId?: string | null
  }

  const conversationId = validateConversationId(body.conversationId)
  const content = validateContent(body.content)
  const fromNodeIds = parseNodeIds(body.fromNodeIds)
  const draftNodeId = typeof body.draftNodeId === 'string' ? body.draftNodeId.trim() || null : null

  if (!conversationId || !content) {
    return c.json({ error: ERROR_MESSAGES.CONTENT_REQUIRED }, 400)
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
      // Ignore error, use default echo
    }
    const result = await createMessageWithAI(c.env.DB, conversationId, content, fromNodeIds, aiEcho, draftNodeId)
    return c.json(result, 201)
  }

  // Load graph-aware conversation history for context
  let history: Awaited<ReturnType<typeof listMessagesForNodeAncestors>> = []
  try {
    if (fromNodeIds.length) {
      history = await listMessagesForNodeAncestors(c.env.DB, conversationId, fromNodeIds, 20)
    }
  } catch (err) {
    console.error('Failed to load message history for AI:', err)
  }

  // Get system instruction and build Gemini contents
  const systemInstruction = await getSystemInstruction(c.env.DB, conversationId)
  const geminiContents = buildGeminiContents(history, content)

  // Generate AI response with retry logic
  let aiContent: string
  try {
    aiContent = await generateAIResponse(apiKey, systemInstruction, geminiContents)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : ERROR_MESSAGES.AI_FAILED }, 500)
  }

  const result = await createMessageWithAI(c.env.DB, conversationId, content, fromNodeIds, aiContent, draftNodeId)

  // Try to auto-generate a short conversation title after the first AI answer
  try {
    const conversation = await getConversationById(c.env.DB, conversationId)
    if (conversation && (conversation.title.toUpperCase() === DEFAULT_CONVERSATION_TITLE.toUpperCase())) {
      const generatedTitle = await generateConversationTitle(apiKey, content, aiContent)
      await updateConversationTitle(c.env.DB, conversationId, generatedTitle)
    }
  } catch (err) {
    console.error('Failed to auto-generate conversation title:', err)
  }

  return c.json(result, 201)
})

app.put('/api/graph/:conversationId/nodes/:nodeId', async (c) => {
  const conversationId = validateConversationId(c.req.param('conversationId'))
  const nodeId = validateConversationId(c.req.param('nodeId'))
  const body = await c.req.json().catch(() => ({})) as { content?: string }
  const content = validateContent(body.content)

  if (!conversationId || !nodeId || !content) {
    return c.json({ error: ERROR_MESSAGES.INVALID_PARAMS }, 400)
  }

  // 1. Update user node and prune children
  try {
    await editUserNodeContent(c.env.DB, conversationId, nodeId, content)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Failed to update node' }, 400)
  }

  // 2. Load history for context (ancestors of the updated node)
  let history: Awaited<ReturnType<typeof listMessagesForNodeAncestors>> = []
  try {
    history = await listMessagesForNodeAncestors(c.env.DB, conversationId, [nodeId], 20)
  } catch (err) {
    console.error('Failed to load message history for AI:', err)
  }

  // 3. Prepare AI call
  const apiKey = c.env.AI_API_KEY
  if (!apiKey) {
    // Echo fallback
    const aiEcho = `Echo (Edited): ${content}`
    const result = await addAiResponseNode(c.env.DB, conversationId, nodeId, aiEcho)
    return c.json(result)
  }

  // Get system instruction and build Gemini contents (history already includes edited message)
  const systemInstruction = await getSystemInstruction(c.env.DB, conversationId)
  const geminiContents = buildGeminiContents(history)

  // Generate AI response with retry logic
  let aiContent: string
  try {
    aiContent = await generateAIResponse(apiKey, systemInstruction, geminiContents)
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : ERROR_MESSAGES.AI_FAILED }, 500)
  }



  // 4. Create AI response node
  const result = await addAiResponseNode(c.env.DB, conversationId, nodeId, aiContent)
  return c.json(result)
})

app.delete('/api/graph/:conversationId/nodes/:nodeId', async (c) => {
  const conversationId = validateConversationId(c.req.param('conversationId'))
  const nodeId = validateConversationId(c.req.param('nodeId'))

  if (!conversationId || !nodeId) {
    return c.json({ error: ERROR_MESSAGES.INVALID_PARAMS }, 400)
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
