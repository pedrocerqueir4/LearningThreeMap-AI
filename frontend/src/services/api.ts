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
    position?: { x: number; y: number } | null
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
        }),
    })
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
