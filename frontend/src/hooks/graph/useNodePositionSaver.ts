import { useCallback, useEffect, useRef } from 'react'
import type { Node } from 'reactflow'
import { useGraphStore } from '../../store/graph'
import type { QaNodeData } from '../../types'

export function useNodePositionSaver(conversationId: string) {
    const { updateNodePositions } = useGraphStore()

    // Ref to track pending position updates (batched and sent when conversation changes)
    const pendingPositionUpdatesRef = useRef<Map<string, { x: number; y: number }>>(
        new Map()
    )

    // Ref to track the current conversationId so cleanup saves to the correct conversation
    const currentConversationIdRef = useRef(conversationId)

    // Update the ref whenever conversationId changes
    useEffect(() => {
        currentConversationIdRef.current = conversationId
    }, [conversationId])

    // Flush pending updates when conversation changes
    useEffect(() => {
        return () => {
            // Cleanup: flush pending node position updates when conversationId changes or component unmounts
            // Use ref to get the DEPARTING conversationId, not the new one
            const departingConversationId = currentConversationIdRef.current

            if (pendingPositionUpdatesRef.current.size > 0) {
                const positions = Array.from(pendingPositionUpdatesRef.current.entries()).map(
                    ([nodeId, { x, y }]) => ({ nodeId, x, y })
                )
                pendingPositionUpdatesRef.current.clear()
                void updateNodePositions(departingConversationId, positions)
            }
        }
    }, [conversationId, updateNodePositions])

    const onNodeDragStop = useCallback(
        (_: React.MouseEvent, node: Node<QaNodeData>) => {
            if (node.data.mode !== 'complete') return

            const anchorNodeId = node.data.anchorNodeId ?? node.id

            // Accumulate position updates instead of sending immediately
            pendingPositionUpdatesRef.current.set(anchorNodeId, {
                x: node.position.x,
                y: node.position.y,
            })
        },
        []
    )

    return { onNodeDragStop }
}
