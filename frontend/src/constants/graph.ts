/**
 * Graph layout and positioning constants
 */

// Note: Node dimensions and positioning are now handled dynamically
// using AABB collision detection in utils/position.ts

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
