import { MIN_DISTANCE, NODE_HEIGHT, POSITION_OFFSETS } from '../constants/graph'

export type Position = { x: number; y: number }

/**
 * Calculate Euclidean distance between two positions
 */
export function calculateDistance(a: Position, b: Position): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Find a free position near the base position that doesn't collide with existing nodes.
 * Uses predefined offsets and prioritizes positioning below the parent node.
 * 
 * @param base - The base position to offset from
 * @param occupiedPositions - Array of currently occupied positions
 * @returns A free position that avoids collisions
 */
export function findFreePosition(base: Position, occupiedPositions: Position[]): Position {
    // Try each offset in priority order
    for (const offset of POSITION_OFFSETS) {
        const candidate = { x: base.x + offset.x, y: base.y + offset.y }
        const collides = occupiedPositions.some((p) => calculateDistance(p, candidate) < MIN_DISTANCE)
        if (!collides) {
            return candidate
        }
    }

    // Fallback: push further down to avoid overlap with node box
    return { x: base.x, y: base.y + NODE_HEIGHT + 100 }
}
