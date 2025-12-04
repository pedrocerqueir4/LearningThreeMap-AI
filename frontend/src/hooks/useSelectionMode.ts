import { useState, useCallback, useEffect } from 'react'
import type { SelectionMode } from '../types'

/**
 * Custom hook for managing selection mode state (ask/delete)
 */
export function useSelectionMode(conversationId: string) {
    const [selectionMode, setSelectionMode] = useState<SelectionMode>('none')
    const [selectedAnchorNodeIds, setSelectedAnchorNodeIds] = useState<string[]>([])

    // Reset selection when conversation changes
    useEffect(() => {
        setSelectedAnchorNodeIds([])
        setSelectionMode('none')
    }, [conversationId])

    const toggleNodeSelection = useCallback(
        (anchorId: string) => {
            setSelectedAnchorNodeIds((current) => {
                if (selectionMode === 'none') {
                    return current.includes(anchorId) ? [] : [anchorId]
                }
                const exists = current.includes(anchorId)
                if (exists) {
                    return current.filter((id) => id !== anchorId)
                }
                return [...current, anchorId]
            })
        },
        [selectionMode]
    )

    const clearSelection = useCallback(() => {
        setSelectedAnchorNodeIds([])
        setSelectionMode('none')
    }, [])

    return {
        selectionMode,
        selectedAnchorNodeIds,
        setSelectionMode,
        setSelectedAnchorNodeIds,
        toggleNodeSelection,
        clearSelection,
    }
}
