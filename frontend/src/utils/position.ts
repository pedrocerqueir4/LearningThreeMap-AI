export type Position = { x: number; y: number }

/**
 * Represents a rectangular node with position and dimensions
 */
export type NodeRect = {
    x: number
    y: number
    width: number
    height: number
}

/**
 * Default node dimensions when actual dimensions are not available
 */
export const DEFAULT_NODE_WIDTH = 320
export const DEFAULT_NODE_HEIGHT = 180
export const NODE_SPACING = 40 // Minimum gap between nodes

/**
 * Calculate Euclidean distance between two positions
 */
export function calculateDistance(a: Position, b: Position): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Check if two rectangles collide (AABB collision detection)
 */
export function rectsCollide(a: NodeRect, b: NodeRect, spacing: number = NODE_SPACING): boolean {
    return !(
        a.x + a.width + spacing <= b.x ||
        b.x + b.width + spacing <= a.x ||
        a.y + a.height + spacing <= b.y ||
        b.y + b.height + spacing <= a.y
    )
}

/**
 * Find a free position near the parent node that doesn't collide with existing nodes.
 * Uses AABB collision detection with actual node dimensions.
 * 
 * @param parentRect - The parent node's rectangle (position + dimensions)
 * @param newNodeDimensions - Dimensions of the new node being placed
 * @param existingNodes - Array of existing node rectangles
 * @returns A free position that avoids collisions
 */
export function findFreePositionAABB(
    parentRect: NodeRect,
    newNodeDimensions: { width: number; height: number },
    existingNodes: NodeRect[]
): Position {
    const { width: newWidth, height: newHeight } = newNodeDimensions

    // Generate candidate positions in priority order:
    // 1. Directly below parent (centered)
    // 2. Below-right
    // 3. Below-left
    // 4. Further below
    // 5. Right side
    // 6. Left side
    // 7. Above (last resort)
    const candidateOffsets = [
        // Directly below, horizontally centered with parent
        { x: 0, y: parentRect.height + NODE_SPACING },
        // Below and to the right
        { x: parentRect.width + NODE_SPACING, y: parentRect.height + NODE_SPACING },
        // Below and to the left
        { x: -(newWidth + NODE_SPACING), y: parentRect.height + NODE_SPACING },
        // Further below
        { x: 0, y: parentRect.height + NODE_SPACING + newHeight + NODE_SPACING },
        // To the right (same level)
        { x: parentRect.width + NODE_SPACING, y: 0 },
        // To the left (same level)
        { x: -(newWidth + NODE_SPACING), y: 0 },
        // Above (last resort)
        { x: 0, y: -(newHeight + NODE_SPACING) },
    ]

    // Try each candidate position
    for (const offset of candidateOffsets) {
        const candidateRect: NodeRect = {
            x: parentRect.x + offset.x,
            y: parentRect.y + offset.y,
            width: newWidth,
            height: newHeight,
        }

        const collides = existingNodes.some((node) => rectsCollide(candidateRect, node))
        if (!collides) {
            return { x: candidateRect.x, y: candidateRect.y }
        }
    }

    // Fallback: use spiral search to find a free position
    return findPositionSpiral(parentRect, newNodeDimensions, existingNodes)
}

/**
 * Spiral search to find a free position when standard offsets fail.
 * Searches in expanding rings around the parent node.
 */
function findPositionSpiral(
    parentRect: NodeRect,
    newNodeDimensions: { width: number; height: number },
    existingNodes: NodeRect[]
): Position {
    const { width: newWidth, height: newHeight } = newNodeDimensions
    const centerX = parentRect.x + parentRect.width / 2 - newWidth / 2
    const centerY = parentRect.y + parentRect.height / 2 - newHeight / 2

    // Search in expanding rings
    for (let ring = 1; ring <= 10; ring++) {
        const ringDistance = ring * (Math.max(newWidth, newHeight) + NODE_SPACING)

        // Check positions around the ring (8 directions per ring)
        const angles = [
            Math.PI / 2,      // below
            Math.PI / 4,      // below-right
            3 * Math.PI / 4,  // below-left
            0,                // right
            Math.PI,          // left
            -Math.PI / 4,     // above-right
            -3 * Math.PI / 4, // above-left
            -Math.PI / 2,     // above
        ]

        for (const angle of angles) {
            const candidateRect: NodeRect = {
                x: centerX + Math.cos(angle) * ringDistance,
                y: centerY + Math.sin(angle) * ringDistance,
                width: newWidth,
                height: newHeight,
            }

            const collides = existingNodes.some((node) => rectsCollide(candidateRect, node))
            if (!collides) {
                return { x: candidateRect.x, y: candidateRect.y }
            }
        }
    }

    // Ultimate fallback: place far below
    const maxY = Math.max(...existingNodes.map((n) => n.y + n.height), parentRect.y + parentRect.height)
    return { x: parentRect.x, y: maxY + NODE_SPACING * 2 }
}
