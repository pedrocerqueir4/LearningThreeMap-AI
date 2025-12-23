import { useCallback, useEffect, useRef } from 'react'
import { useReactFlow } from 'reactflow'
import * as api from '../../services/api'

export function useViewportPersistence(conversationId: string) {
    const { setViewport, getViewport } = useReactFlow()

    // Ref to track if viewport has been restored for the current conversation
    const viewportRestoredRef = useRef(false)
    const saveViewportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Reset the restoration flag when conversation changes
    useEffect(() => {
        return () => {
            viewportRestoredRef.current = false
        }
    }, [conversationId])

    // Restore viewport from conversation data when loading
    useEffect(() => {
        // Skip if already restored for this conversation
        if (viewportRestoredRef.current) return

        const restoreViewport = async () => {
            try {
                const conversation = await api.getConversation(conversationId)

                if (
                    conversation &&
                    typeof conversation.viewport_x === 'number' &&
                    typeof conversation.viewport_y === 'number' &&
                    typeof conversation.viewport_zoom === 'number'
                ) {
                    setViewport(
                        {
                            x: conversation.viewport_x,
                            y: conversation.viewport_y,
                            zoom: conversation.viewport_zoom,
                        },
                        { duration: 0 }
                    )
                    viewportRestoredRef.current = true
                } else {
                    // No saved viewport
                    viewportRestoredRef.current = true
                }
            } catch (error) {
                // If fetching fails
                viewportRestoredRef.current = true
            }
        }

        void restoreViewport()
    }, [conversationId, setViewport])

    // Save viewport with debounce
    const debouncedSaveViewport = useCallback(() => {
        // Don't save if we haven't restored the viewport yet
        if (!viewportRestoredRef.current) return

        if (saveViewportTimeoutRef.current) {
            clearTimeout(saveViewportTimeoutRef.current)
        }
        saveViewportTimeoutRef.current = setTimeout(() => {
            const viewport = getViewport()
            void api.updateConversationViewport(conversationId, {
                x: viewport.x,
                y: viewport.y,
                zoom: viewport.zoom,
            })
        }, 500)
    }, [conversationId, getViewport])

    // Handle when user finishes panning/zooming
    const onMoveEnd = useCallback(() => {
        debouncedSaveViewport()
    }, [debouncedSaveViewport])

    // Save viewport on unmount/change
    useEffect(() => {
        return () => {
            if (viewportRestoredRef.current) {
                const currentViewport = getViewport()
                void api.updateConversationViewport(conversationId, {
                    x: currentViewport.x,
                    y: currentViewport.y,
                    zoom: currentViewport.zoom,
                })
            }
        }
    }, [conversationId, getViewport])

    return { onMoveEnd, viewportRestoredRef }
}
