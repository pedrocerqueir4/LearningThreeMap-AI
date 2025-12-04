import { useState, useCallback } from 'react'

/**
 * Custom hook for managing edit mode state
 * Reusable across different components that need edit functionality
 */
export function useEditMode(initialContent: string = '') {
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState(initialContent)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const startEditing = useCallback((content: string) => {
        setEditContent(content)
        setIsEditing(true)
        setError(null)
    }, [])

    const cancelEditing = useCallback(() => {
        setIsEditing(false)
        setEditContent('')
        setError(null)
    }, [])

    const saveEdit = useCallback(
        async (onSave: (content: string) => Promise<void>, originalContent?: string) => {
            const trimmed = editContent.trim()

            if (!trimmed || trimmed === originalContent) {
                cancelEditing()
                return
            }

            setIsSaving(true)
            setError(null)

            try {
                await onSave(trimmed)
                setIsEditing(false)
                setEditContent('')
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to save edit')
            } finally {
                setIsSaving(false)
            }
        },
        [editContent, cancelEditing]
    )

    return {
        isEditing,
        editContent,
        isSaving,
        error,
        setEditContent,
        setError,
        startEditing,
        cancelEditing,
        saveEdit,
    }
}
