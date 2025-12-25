/**
 * Centralized type definitions for the application
 */

// Re-export store types for convenience
export type { Conversation } from '../store/conversations'
export type { Message } from '../store/messages'
export type { GraphNode, GraphEdge } from '../store/graph'

/**
 * Node data for QA (Question-Answer) nodes in the graph
 */
export type QaNodeData = {
    id: string
    mode: 'draft' | 'complete'
    userText: string | null
    aiText: string | null
    anchorNodeId: string | null
    fromNodeIds: string[] | null
    onSend: (fromNodeIds: string[] | null, content: string, draftId: string, contextRanges?: ContextRange[] | null) => Promise<void>
    onCreateDraftBelow: (nodeId: string, anchorNodeId: string | null) => void
    onEdit: (nodeId: string, newContent: string) => Promise<void>
    isZoomed: boolean
    // Lock mode for text selection
    isLocked?: boolean
    onToggleLockMode?: () => void
    onTextSelected?: (nodeId: string, rect: DOMRect) => void
    // Context blocks to be added to the input (for draft mode)
    pendingContexts?: Array<{ id: string, text: string, sourceNodeId: string, sourceStartPos?: number, sourceEndPos?: number }>
    // Context ranges loaded from database (for complete mode)
    contextRanges?: ContextRange[] | null
    // Source context ranges from child nodes referencing this node's AI text
    sourceContextRanges?: ContextRange[] | null
    // Navigation callback for context span clicks
    onNavigateToSource?: (sourceNodeId: string, highlightText?: string) => void
    // Text to highlight temporarily in AI text (for navigation feedback)
    highlightText?: string | null
}

/**
 * Context range representing a span of text referencing another node
 */
export type ContextRange = {
    sourceNodeId: string
    startPos: number
    endPos: number
    sourceStartPos?: number  // Position in source node's AI text where context was extracted
    sourceEndPos?: number    // End position in source node's AI text
}


/**
 * Draft node representation
 */
export type DraftNode = {
    id: string
    anchorNodeId: string | null
    fromNodeIds: string[]
    pendingContexts?: Array<{ id: string, text: string, sourceNodeId: string }>
}

/**
 * Selection mode for graph interactions
 */
export type SelectionMode = 'none' | 'ask' | 'delete'

/**
 * Theme mode
 */
export type ThemeMode = 'light' | 'dark'
