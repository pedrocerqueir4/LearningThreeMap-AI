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

    const createDraft = useCallback((anchorNodeId: string | null, fromNodeIds: string[], contextText?: string | null) => {
        setDrafts((current) => [
            ...current,
            {
                id: crypto.randomUUID(),
                anchorNodeId,
                fromNodeIds,
                contextText: contextText ?? null,
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

    const updateDraftContextText = useCallback((draftId: string, contextText: string) => {
        setDrafts((current) =>
            current.map((d) => d.id === draftId ? { ...d, contextText } : d)
        )
    }, [])

    return {
        drafts,
        createDraft,
        createDraftBelow,
        removeDraft,
        removeDraftsByAnchorIds,
        updateDraftContextText,
    }
}
