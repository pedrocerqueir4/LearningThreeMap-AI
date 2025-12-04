/**
 * Graph layout and positioning constants
 */

// Node dimensions for collision detection
export const NODE_HEIGHT = 180
export const MIN_DISTANCE = 280

/**
 * Priority-ordered position offsets for placing draft nodes.
 * Prioritizes positioning below the parent node.
 */
export const POSITION_OFFSETS: { x: number; y: number }[] = [
    { x: 0, y: 220 }, // directly below
    { x: 0, y: 440 }, // further below
    { x: 260, y: 220 }, // below-right
    { x: -260, y: 220 }, // below-left
    { x: 260, y: 0 }, // right
    { x: -260, y: 0 }, // left
    { x: 0, y: -220 }, // above (last resort)
]

/**
 * Edge styling configuration
 */
export const EDGE_STYLE = {
    stroke: '#111827',
    strokeWidth: 2,
}

export const EDGE_MARKER = {
    width: 18,
    height: 18,
    color: '#111827',
}

/**
 * React Flow configuration
 */
export const REACT_FLOW_CONFIG = {
    minZoom: 0.07,
    maxZoom: 4,
    fitViewPadding: 0.2,
}
