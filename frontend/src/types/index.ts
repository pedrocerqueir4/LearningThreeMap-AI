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
    onSend: (fromNodeIds: string[] | null, content: string, draftId: string) => Promise<void>
    onCreateDraftBelow: (nodeId: string, anchorNodeId: string | null) => void
    onEdit: (nodeId: string, newContent: string) => Promise<void>
    isZoomed: boolean
    // Lock mode for text selection
    isLocked?: boolean
    onToggleLockMode?: () => void
    onTextSelected?: (nodeId: string, rect: DOMRect) => void
    // Context blocks to be added to the input
    pendingContexts?: Array<{ id: string, text: string }>
}


/**
 * Draft node representation
 */
export type DraftNode = {
    id: string
    anchorNodeId: string | null
    fromNodeIds: string[]
    pendingContexts?: Array<{ id: string, text: string }>
}

/**
 * Selection mode for graph interactions
 */
export type SelectionMode = 'none' | 'ask' | 'delete'

/**
 * Theme mode
 */
export type ThemeMode = 'light' | 'dark'
