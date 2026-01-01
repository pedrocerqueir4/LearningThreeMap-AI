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
  createUserMessageOnly,
  deleteConversation,
  updateNodePositions,
  listMessagesForNodeAncestors,
  deleteNodeSubtreeRespectingJoins,
  buildEchoFromAncestors,
  updateConversationTitle,
  getConversationById,
  updateConversationSystemInstruction,
  updateConversationViewport,
  editUserNodeContent,
  addAiResponseNode,
} from './db'
import { generateAIResponse, generateAIResponseStream, getSystemInstruction, buildGeminiContents, generateConversationTitle } from './ai-service'
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

app.get('/api/conversations/:conversationId', async (c) => {
  const conversationId = validateConversationId(c.req.param('conversationId'))
  if (!conversationId) {
    return c.json({ error: ERROR_MESSAGES.CONVERSATION_ID_REQUIRED }, 400)
  }

  const conversation = await getConversationById(c.env.DB, conversationId)
  if (!conversation) {
    return c.json({ error: ERROR_MESSAGES.CONVERSATION_NOT_FOUND }, 404)
  }

  return c.json(conversation)
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

app.post('/api/conversations/:conversationId/viewport', async (c) => {
  const conversationId = validateConversationId(c.req.param('conversationId'))

  if (!conversationId) {
    return c.json({ error: ERROR_MESSAGES.CONVERSATION_ID_REQUIRED }, 400)
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    x?: number
    y?: number
    zoom?: number
  }

  // Validate viewport values - must be finite numbers (not NaN or Infinity)
  if (
    typeof body.x !== 'number' ||
    typeof body.y !== 'number' ||
    typeof body.zoom !== 'number' ||
    !isFinite(body.x) ||
    !isFinite(body.y) ||
    !isFinite(body.zoom)
  ) {
    return c.json({ error: 'Invalid viewport data: values must be finite numbers' }, 400)
  }

  try {
    await updateConversationViewport(c.env.DB, conversationId, body.x, body.y, body.zoom)
    return c.json({ success: true })
  } catch (error) {
    // Non-critical operation, log but don't fail
    console.error('Failed to update viewport:', error)
    return c.json({ success: false }, 500)
  }
})

app.post('/api/messages', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    conversationId?: string
    content?: string
    fromNodeIds?: string[]
    draftNodeId?: string | null
    position?: { x: number; y: number } | null
    contextRanges?: { sourceNodeId: string; startPos: number; endPos: number }[] | null
  }

  const conversationId = validateConversationId(body.conversationId)
  const content = validateContent(body.content)
  const fromNodeIds = parseNodeIds(body.fromNodeIds)
  const draftNodeId = typeof body.draftNodeId === 'string' ? body.draftNodeId.trim() || null : null
  const position = body.position && typeof body.position.x === 'number' && typeof body.position.y === 'number'
    ? { x: body.position.x, y: body.position.y }
    : null

  // Parse and validate context ranges
  const contextRanges = Array.isArray(body.contextRanges)
    ? body.contextRanges.filter(
      (r): r is { sourceNodeId: string; startPos: number; endPos: number } =>
        typeof r.sourceNodeId === 'string' &&
        typeof r.startPos === 'number' &&
        typeof r.endPos === 'number'
    )
    : null

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
    const result = await createMessageWithAI(c.env.DB, conversationId, content, fromNodeIds, aiEcho, draftNodeId, position, contextRanges)
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

  const result = await createMessageWithAI(c.env.DB, conversationId, content, fromNodeIds, aiContent, draftNodeId, position, contextRanges)

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

// Streaming messages endpoint using Server-Sent Events
app.post('/api/messages/stream', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    conversationId?: string
    content?: string
    fromNodeIds?: string[]
    draftNodeId?: string | null
    position?: { x: number; y: number } | null
    contextRanges?: { sourceNodeId: string; startPos: number; endPos: number }[] | null
  }

  const conversationId = validateConversationId(body.conversationId)
  const content = validateContent(body.content)
  const fromNodeIds = parseNodeIds(body.fromNodeIds)
  const draftNodeId = typeof body.draftNodeId === 'string' ? body.draftNodeId.trim() || null : null
  const position = body.position && typeof body.position.x === 'number' && typeof body.position.y === 'number'
    ? { x: body.position.x, y: body.position.y }
    : null

  const contextRanges = Array.isArray(body.contextRanges)
    ? body.contextRanges.filter(
      (r): r is { sourceNodeId: string; startPos: number; endPos: number } =>
        typeof r.sourceNodeId === 'string' &&
        typeof r.startPos === 'number' &&
        typeof r.endPos === 'number'
    )
    : null

  if (!conversationId || !content) {
    return c.json({ error: ERROR_MESSAGES.CONTENT_REQUIRED }, 400)
  }

  const apiKey = c.env.AI_API_KEY
  if (!apiKey) {
    // Fall back to non-streaming if no API key
    let aiEcho = `Echo: ${content}`
    try {
      if (fromNodeIds.length) {
        aiEcho = await buildEchoFromAncestors(c.env.DB, conversationId, fromNodeIds, content)
      }
    } catch {
      // Ignore
    }
    const result = await createMessageWithAI(c.env.DB, conversationId, content, fromNodeIds, aiEcho, draftNodeId, position, contextRanges)
    return c.json(result, 201)
  }

  // Load message history
  let history: Awaited<ReturnType<typeof listMessagesForNodeAncestors>> = []
  try {
    if (fromNodeIds.length) {
      history = await listMessagesForNodeAncestors(c.env.DB, conversationId, fromNodeIds, 20)
    }
  } catch (err) {
    console.error('Failed to load message history:', err)
  }

  const systemInstruction = await getSystemInstruction(c.env.DB, conversationId)
  const geminiContents = buildGeminiContents(history, content)

  // Create user message first
  const { userMessage, userNode, newEdges } = await createUserMessageOnly(
    c.env.DB,
    conversationId,
    content,
    fromNodeIds,
    draftNodeId,
    position,
    contextRanges
  )

  // Set up SSE stream
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial event with user message info
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'user_created',
          userMessage,
          userNode,
          newEdges,
        })}\n\n`))

        // Stream AI response
        let fullAiContent = ''

        try {
          for await (const chunk of generateAIResponseStream(apiKey, systemInstruction, geminiContents)) {
            fullAiContent += chunk
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'ai_chunk',
              chunk,
              fullContent: fullAiContent,
            })}\n\n`))
          }
        } catch (streamError) {
          console.error('Streaming error:', streamError)
          // If streaming fails, try non-streaming as fallback
          fullAiContent = await generateAIResponse(apiKey, systemInstruction, geminiContents)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'ai_chunk',
            chunk: fullAiContent,
            fullContent: fullAiContent,
          })}\n\n`))
        }

        // Save AI message and node to database
        const { aiMessage, aiNode, edge } = await addAiResponseNode(
          c.env.DB,
          conversationId,
          userNode.id,
          fullAiContent
        )

        // Send completion event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'complete',
          aiMessage,
          aiNode,
          edge,
        })}\n\n`))

        // Try to auto-generate title
        try {
          const conversation = await getConversationById(c.env.DB, conversationId)
          if (conversation && (conversation.title.toUpperCase() === DEFAULT_CONVERSATION_TITLE.toUpperCase())) {
            const generatedTitle = await generateConversationTitle(apiKey, content, fullAiContent)
            await updateConversationTitle(c.env.DB, conversationId, generatedTitle)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'title_generated',
              title: generatedTitle,
            })}\n\n`))
          }
        } catch (err) {
          console.error('Failed to auto-generate title:', err)
        }

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
        controller.close()
      } catch (error) {
        console.error('Stream error:', error)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })}\n\n`))
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
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
