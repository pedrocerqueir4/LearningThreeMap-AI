import type { GraphNode } from '../../store/graph'

export type Pair = {
    id: string
    userNode: GraphNode
    aiNode: GraphNode | null
    anchorNodeId: string
}

export type ChatEditState = {
    isEditing: boolean
    editContent: string
    isSaving: boolean
    error: string | null
    setEditContent: (content: string) => void
    setError: (error: string | null) => void
    startEditing: (content: string) => void
    cancelEditing: () => void
    saveEdit: (
        onSave: (content: string) => Promise<void>,
        originalContent?: string
    ) => Promise<void>
}
