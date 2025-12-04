/**
 * Database helper functions to reduce code duplication
 */

import type { Message, GraphNode, GraphEdge } from './db'

/**
 * Insert a message into the database
 */
export async function insertMessage(
    db: D1Database,
    message: Message
): Promise<void> {
    await db
        .prepare(
            'INSERT INTO messages (id, conversation_id, author, content, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(
            message.id,
            message.conversation_id,
            message.author,
            message.content,
            message.created_at
        )
        .run()
}

/**
 * Insert a node into the database
 */
export async function insertNode(
    db: D1Database,
    node: GraphNode
): Promise<void> {
    await db
        .prepare(
            'INSERT INTO nodes (id, conversation_id, message_id, type, label, created_at, pos_x, pos_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
            node.id,
            node.conversation_id,
            node.message_id,
            node.type,
            node.label,
            node.created_at,
            node.pos_x,
            node.pos_y
        )
        .run()
}

/**
 * Insert an edge into the database
 */
export async function insertEdge(
    db: D1Database,
    edge: GraphEdge
): Promise<void> {
    await db
        .prepare(
            'INSERT INTO edges (id, conversation_id, source, target, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(edge.id, edge.conversation_id, edge.source, edge.target, edge.created_at)
        .run()
}

/**
 * Fetch all nodes and edges for a conversation
 */
export async function fetchGraphStructure(
    db: D1Database,
    conversationId: string
): Promise<{
    nodes: { id: string; message_id: string | null }[]
    edges: { source: string; target: string }[]
}> {
    const nodesRes = await db
        .prepare('SELECT id, message_id FROM nodes WHERE conversation_id = ?')
        .bind(conversationId)
        .all<{ id: string; message_id: string | null }>()

    const edgesRes = await db
        .prepare('SELECT source, target FROM edges WHERE conversation_id = ?')
        .bind(conversationId)
        .all<{ source: string; target: string }>()

    return {
        nodes: (nodesRes.results || []) as { id: string; message_id: string | null }[],
        edges: (edgesRes.results || []) as { source: string; target: string }[],
    }
}

/**
 * Create a message object
 */
export function createMessage(
    conversationId: string,
    author: 'user' | 'ai',
    content: string
): Message {
    return {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        author,
        content,
        created_at: new Date().toISOString(),
    }
}

/**
 * Create a node object
 */
export function createNode(
    conversationId: string,
    messageId: string | null,
    type: 'user' | 'ai',
    label: string
): GraphNode {
    return {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        message_id: messageId,
        type,
        label,
        created_at: new Date().toISOString(),
        pos_x: null,
        pos_y: null,
    }
}

/**
 * Create an edge object
 */
export function createEdge(
    conversationId: string,
    source: string,
    target: string
): GraphEdge {
    return {
        id: crypto.randomUUID(),
        conversation_id: conversationId,
        source,
        target,
        created_at: new Date().toISOString(),
    }
}
