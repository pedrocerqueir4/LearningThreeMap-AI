import { useState, useCallback, useEffect } from 'react'
import type { DraftNode } from '../types'

/**
 * Custom hook for managing draft nodes in the conversation graph
 */
export function useDraftNodes(conversationId: string) {
    const [drafts, setDrafts] = useState<DraftNode[]>([])

    // Reset drafts when conversation changes
    useEffect(() => {
        setDrafts([])
    }, [conversationId])

    const createDraft = useCallback((anchorNodeId: string | null, fromNodeIds: string[]) => {
        setDrafts((current) => [
            ...current,
            {
                id: crypto.randomUUID(),
                anchorNodeId,
                fromNodeIds,
            },
        ])
    }, [])

    const createDraftBelow = useCallback((nodeId: string, anchorNodeId: string | null) => {
        setDrafts((current) => [
            ...current,
            {
                id: crypto.randomUUID(),
                anchorNodeId: anchorNodeId ?? nodeId,
                fromNodeIds: [anchorNodeId ?? nodeId],
            },
        ])
    }, [])

    const removeDraft = useCallback((draftId: string) => {
        setDrafts((current) => current.filter((d) => d.id !== draftId))
    }, [])

    const removeDraftsByAnchorIds = useCallback((anchorIds: string[]) => {
        setDrafts((current) => current.filter((d) => !anchorIds.includes(d.anchorNodeId ?? d.id)))
    }, [])

    return {
        drafts,
        createDraft,
        createDraftBelow,
        removeDraft,
        removeDraftsByAnchorIds,
    }
}
