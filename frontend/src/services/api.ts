/**
 * Centralized API service layer
 * All HTTP requests go through this module for consistency and maintainability
 */

import type { Conversation } from '../types'

/**
 * Base API request helper with error handling
 */
async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, options)

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null
        const message = errorBody?.error ?? `Request failed with status ${response.status}`
        throw new Error(message)
    }

    return response.json() as Promise<T>
}

// ============================================================================
// Conversation API
// ============================================================================

export async function fetchConversations(): Promise<Conversation[]> {
    return apiRequest<Conversation[]>('/api/conversations')
}

export async function getConversation(conversationId: string): Promise<Conversation> {
    return apiRequest<Conversation>(`/api/conversations/${conversationId}`)
}

export async function createConversation(title?: string): Promise<Conversation> {
    return apiRequest<Conversation>('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title ?? 'New conversation' }),
    })
}

export async function deleteConversation(conversationId: string): Promise<void> {
    await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' })
}

export async function updateConversationTitle(conversationId: string, title: string): Promise<Conversation> {
    return apiRequest<Conversation>(`/api/conversations/${conversationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
    })
}

export async function updateConversationSystemInstruction(
    conversationId: string,
    instruction: string
): Promise<Conversation> {
    return apiRequest<Conversation>(`/api/conversations/${conversationId}/agent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: instruction }),
    })
}

// ============================================================================
// Message API
// ============================================================================

type MessageResponse = {
    userMessage: {
        id: string
        conversation_id: string
        author: 'user' | 'ai'
        content: string
        created_at: string
    }
    aiMessage: {
        id: string
        conversation_id: string
        author: 'user' | 'ai'
        content: string
        created_at: string
    }
}

export async function sendMessage(
    conversationId: string,
    content: string,
    fromNodeIds?: string[] | null,
    draftNodeId?: string | null,
    position?: { x: number; y: number } | null,
    contextRanges?: { sourceNodeId: string; startPos: number; endPos: number }[] | null
): Promise<MessageResponse> {
    return apiRequest<MessageResponse>('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            conversationId,
            content: content.trim(),
            fromNodeIds: fromNodeIds ?? [],
            draftNodeId: draftNodeId ?? null,
            position: position ?? null,
            contextRanges: contextRanges ?? null,
        }),
    })
}

/**
 * SSE streaming message types
 */
type StreamEventUserCreated = {
    type: 'user_created'
    userMessage: MessageResponse['userMessage']
    userNode: GraphResponse['nodes'][0]
    newEdges: GraphResponse['edges']
}

type StreamEventAIChunk = {
    type: 'ai_chunk'
    chunk: string
    fullContent: string
}

type StreamEventComplete = {
    type: 'complete'
    aiMessage: MessageResponse['aiMessage']
    aiNode: GraphResponse['nodes'][0]
    edge: GraphResponse['edges'][0]
}

type StreamEventTitleGenerated = {
    type: 'title_generated'
    title: string
}

type StreamEventError = {
    type: 'error'
    error: string
}

type StreamEvent =
    | StreamEventUserCreated
    | StreamEventAIChunk
    | StreamEventComplete
    | StreamEventTitleGenerated
    | StreamEventError

export type StreamCallbacks = {
    onUserCreated?: (data: StreamEventUserCreated) => void
    onAIChunk?: (chunk: string, fullContent: string) => void
    onComplete?: (data: StreamEventComplete) => void
    onTitleGenerated?: (title: string) => void
    onError?: (error: string) => void
}

/**
 * Send a message with streaming AI response
 */
export async function sendMessageStream(
    conversationId: string,
    content: string,
    callbacks: StreamCallbacks,
    fromNodeIds?: string[] | null,
    draftNodeId?: string | null,
    position?: { x: number; y: number } | null,
    contextRanges?: { sourceNodeId: string; startPos: number; endPos: number }[] | null
): Promise<void> {
    const response = await fetch('/api/messages/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            conversationId,
            content: content.trim(),
            fromNodeIds: fromNodeIds ?? [],
            draftNodeId: draftNodeId ?? null,
            position: position ?? null,
            contextRanges: contextRanges ?? null,
        }),
    })

    if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as { error?: string } | null
        const message = errorBody?.error ?? `Request failed with status ${response.status}`
        callbacks.onError?.(message)
        throw new Error(message)
    }

    if (!response.body) {
        throw new Error('Response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6)
                    if (jsonStr.trim() === '[DONE]') continue

                    try {
                        const event = JSON.parse(jsonStr) as StreamEvent

                        switch (event.type) {
                            case 'user_created':
                                callbacks.onUserCreated?.(event)
                                break
                            case 'ai_chunk':
                                callbacks.onAIChunk?.(event.chunk, event.fullContent)
                                break
                            case 'complete':
                                callbacks.onComplete?.(event)
                                break
                            case 'title_generated':
                                callbacks.onTitleGenerated?.(event.title)
                                break
                            case 'error':
                                callbacks.onError?.(event.error)
                                break
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }
        }
    } finally {
        reader.releaseLock()
    }
}

// ============================================================================
// Graph API
// ============================================================================

export type GraphResponse = {
    nodes: Array<{
        id: string
        conversation_id: string
        message_id: string | null
        type: 'user' | 'ai'
        label: string
        created_at: string
        pos_x: number | null
        pos_y: number | null
        context_ranges: { sourceNodeId: string; startPos: number; endPos: number }[] | null
    }>
    edges: Array<{
        id: string
        conversation_id: string
        source: string
        target: string
        created_at: string
    }>
}

export async function fetchGraph(conversationId: string): Promise<GraphResponse> {
    return apiRequest<GraphResponse>(`/api/graph/${conversationId}`)
}

export async function updateNodePositions(
    conversationId: string,
    positions: { nodeId: string; x: number; y: number }[]
): Promise<void> {
    await fetch(`/api/graph/${conversationId}/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions }),
    }).catch(() => {
        // Ignore position update errors; UI already reflects the new layout
    })
}

export async function updateNode(conversationId: string, nodeId: string, content: string): Promise<void> {
    await apiRequest(`/api/graph/${conversationId}/nodes/${encodeURIComponent(nodeId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    })
}

export async function deleteNode(conversationId: string, nodeId: string): Promise<void> {
    await fetch(`/api/graph/${conversationId}/nodes/${encodeURIComponent(nodeId)}`, {
        method: 'DELETE',
    })
}

// ============================================================================
// Viewport API
// ============================================================================

export async function updateConversationViewport(
    conversationId: string,
    viewport: { x: number; y: number; zoom: number }
): Promise<void> {
    await fetch(`/api/conversations/${conversationId}/viewport`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(viewport),
    }).catch(() => {
        // Ignore viewport update errors; UI already reflects the new viewport
    })
}
