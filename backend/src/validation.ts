/**
 * Validation utilities for request parameters
 */

export type NodePositionUpdate = { nodeId: string; x: number; y: number }

/**
 * Validate and sanitize a conversation ID
 */
export function validateConversationId(value: unknown): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
    }
    return null
}

/**
 * Validate and sanitize a node ID
 */
export function validateNodeId(value: unknown): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
    }
    return null
}

/**
 * Validate and sanitize content
 */
export function validateContent(value: unknown): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
    }
    return null
}

/**
 * Validate and sanitize a title
 */
export function validateTitle(value: unknown, allowEmpty = false): string | null {
    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (allowEmpty) return trimmed
        return trimmed.length > 0 ? trimmed : null
    }
    return null
}

/**
 * Parse and validate an array of node IDs
 */
export function parseNodeIds(value: unknown): string[] {
    if (!Array.isArray(value)) return []

    return value
        .map((id) => (typeof id === 'string' ? id.trim() : ''))
        .filter((id) => id.length > 0)
}

/**
 * Parse and validate node position updates
 */
export function parsePositions(
    value: unknown
): NodePositionUpdate[] {
    if (!Array.isArray(value)) return []

    return value
        .map((p) => {
            const nodeId = typeof p?.nodeId === 'string' ? p.nodeId.trim() : ''
            const x = typeof p?.x === 'number' ? p.x : null
            const y = typeof p?.y === 'number' ? p.y : null
            if (!nodeId || x === null || y === null) return null
            return { nodeId, x, y }
        })
        .filter((p): p is NodePositionUpdate => p !== null)
}
