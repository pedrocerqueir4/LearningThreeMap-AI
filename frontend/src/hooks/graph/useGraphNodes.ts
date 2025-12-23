import { useMemo, useRef } from 'react'
import { MarkerType, useReactFlow } from 'reactflow'
import type { Node, Edge } from 'reactflow'
import type { GraphNode, GraphEdge } from '../../store/graph'
import type { QaNodeData, DraftNode } from '../../types' // DraftNode from types
import type { Pair } from '../../components/graph/types'
import {
    findFreePositionAABB,
    DEFAULT_NODE_WIDTH,
    DEFAULT_NODE_HEIGHT,
    type NodeRect,
} from '../../utils/position'
import { EDGE_STYLE, EDGE_MARKER } from '../../constants/graph'

type UseGraphNodesProps = {
    graph: { nodes: GraphNode[]; edges: GraphEdge[] } | null
    drafts: DraftNode[]
    zoomedNodeId: string | null
    selectionMode: 'none' | 'ask' | 'delete'
    selectedAnchorNodeIds: string[]
    isLockMode: boolean
    handleSendFromDraft: (
        fromNodeIds: string[] | null,
        content: string,
        draftId: string
    ) => Promise<void>
    createDraftBelow: (nodeId: string, anchorNodeId: string | null) => void
    handleEditNode: (nodeId: string, newContent: string) => Promise<void>
    handleToggleLockMode: () => void
    handleTextSelected: (nodeId: string, rect: DOMRect) => void
}

export function useGraphNodes({
    graph,
    drafts,
    zoomedNodeId,
    selectionMode,
    selectedAnchorNodeIds,
    isLockMode,
    handleSendFromDraft,
    createDraftBelow,
    handleEditNode,
    handleToggleLockMode,
    handleTextSelected,
}: UseGraphNodesProps) {
    const { getNodes } = useReactFlow()

    // Ref to persist measured node dimensions across re-renders
    const measuredDimensionsRef = useRef<
        Map<string, { width: number; height: number }>
    >(new Map())

    const result = useMemo(() => {
        const rawNodes = graph?.nodes ?? []
        const rawEdges = graph?.edges ?? []

        const nodeById = new Map<string, GraphNode>()
        for (const n of rawNodes) nodeById.set(n.id, n)

        // Group user + ai nodes into QA pairs
        const pairs: Pair[] = []

        for (const n of rawNodes) {
            if (n.type !== 'user') continue
            const userNode = n

            // Find an edge from this user node to an AI node
            const toAiEdge = rawEdges.find((e) => e.source === userNode.id)
            const aiNode = toAiEdge ? nodeById.get(toAiEdge.target) ?? null : null

            const anchorNodeId = aiNode?.id ?? userNode.id

            pairs.push({
                id: userNode.id,
                userNode,
                aiNode: aiNode ?? null,
                anchorNodeId,
            })
        }

        // Ensure a stable chronological order for chat view
        pairs.sort((a, b) =>
            a.userNode.created_at.localeCompare(b.userNode.created_at)
        )

        // Build mapping from graph node id -> pair id (for edges between pairs)
        const pairIdByAnchorNodeId = new Map<string, string>()
        for (const p of pairs) {
            pairIdByAnchorNodeId.set(p.anchorNodeId, p.id)
        }

        // Position nodes based on saved positions when available; otherwise fall back to simple layout
        const reactFlowNodes: Node<QaNodeData>[] = pairs.map((p, index) => {
            const fallbackPosition = { x: 0, y: index * 240 }
            const anchorGraphNode = nodeById.get(p.anchorNodeId)
            let position = fallbackPosition

            if (
                anchorGraphNode &&
                anchorGraphNode.pos_x != null &&
                anchorGraphNode.pos_y != null
            ) {
                position = { x: anchorGraphNode.pos_x, y: anchorGraphNode.pos_y }
            } else if (p.userNode.pos_x != null && p.userNode.pos_y != null) {
                // Fallback to user node position if anchor (e.g. AI node) has no position yet
                position = { x: p.userNode.pos_x, y: p.userNode.pos_y }
            }

            return {
                id: p.id,
                type: 'qa',
                position,
                data: {
                    id: p.id,
                    mode: 'complete',
                    userText: p.userNode.label,
                    aiText: p.aiNode?.label ?? null,
                    anchorNodeId: p.anchorNodeId,
                    fromNodeIds: null,
                    onSend: handleSendFromDraft,
                    onCreateDraftBelow: createDraftBelow,
                    onEdit: handleEditNode,
                    isZoomed: zoomedNodeId === p.id,
                    isLocked: isLockMode,
                    onToggleLockMode: handleToggleLockMode,
                    onTextSelected: handleTextSelected,
                },
                selected:
                    selectionMode !== 'none' &&
                    selectedAnchorNodeIds.includes(p.anchorNodeId),
            }
        })

        // Cache React Flow nodes snapshot once for consistent dimension lookups
        const rfNodesSnapshot = getNodes()

        // Update the persisted dimensions ref with any valid measurements from React Flow
        for (const rfNode of rfNodesSnapshot) {
            if (rfNode.width != null && rfNode.height != null) {
                measuredDimensionsRef.current.set(rfNode.id, {
                    width: rfNode.width,
                    height: rfNode.height,
                })
            }
        }

        // Build node rectangles for collision detection using actual dimensions
        const getNodeRect = (node: Node<QaNodeData>): NodeRect => {
            // First try React Flow snapshot, then fall back to cached dimensions
            const rfNode = rfNodesSnapshot.find((n) => n.id === node.id)
            const cachedDims = measuredDimensionsRef.current.get(node.id)

            // Priority: RF snapshot dimensions > cached dimensions > defaults
            const width = rfNode?.width ?? cachedDims?.width ?? DEFAULT_NODE_WIDTH
            const height = rfNode?.height ?? cachedDims?.height ?? DEFAULT_NODE_HEIGHT

            return {
                x: node.position.x,
                y: node.position.y,
                width: width,
                height: height,
            }
        }

        // Track occupied node rectangles for collision detection
        const occupiedRects: NodeRect[] = reactFlowNodes.map(getNodeRect)

        // Add local draft nodes (empty question boxes)
        const draftNodes: Node<QaNodeData>[] = drafts.map((draft, index) => {
            // Default dimensions for new draft nodes
            const draftWidth = DEFAULT_NODE_WIDTH
            const draftHeight = DEFAULT_NODE_HEIGHT

            // Default fallback position for root drafts (created from the bottom toolbar)
            let parentRect: NodeRect = {
                x: 0,
                y: (pairs.length + index) * 220,
                width: draftWidth,
                height: draftHeight,
            }

            if (draft.anchorNodeId) {
                const sourcePairId = pairIdByAnchorNodeId.get(draft.anchorNodeId)
                if (sourcePairId) {
                    const parentNode = reactFlowNodes.find((n) => n.id === sourcePairId)
                    if (parentNode) {
                        // Get actual parent dimensions
                        parentRect = getNodeRect(parentNode)
                    }
                }
            }

            // Find a free position using AABB collision detection
            const position = findFreePositionAABB(
                parentRect,
                { width: draftWidth, height: draftHeight },
                occupiedRects
            )

            // Add this draft to occupied rects for subsequent drafts
            occupiedRects.push({
                x: position.x,
                y: position.y,
                width: draftWidth,
                height: draftHeight,
            })

            return {
                id: draft.id,
                type: 'qa',
                position,
                data: {
                    id: draft.id,
                    mode: 'draft',
                    userText: null,
                    aiText: null,
                    anchorNodeId: draft.anchorNodeId,
                    fromNodeIds: draft.fromNodeIds,
                    pendingContexts: draft.pendingContexts,
                    onSend: handleSendFromDraft,
                    onCreateDraftBelow: createDraftBelow,
                    onEdit: handleEditNode,
                    isZoomed: zoomedNodeId === draft.id,
                },
                selected:
                    selectionMode !== 'none' &&
                    selectedAnchorNodeIds.includes(draft.anchorNodeId ?? draft.id),
            }
        })

        reactFlowNodes.push(...draftNodes)

        const reactFlowEdges: Edge[] = []

        for (const e of rawEdges) {
            // An edge from an anchor node to a user node of the next pair means pair-to-pair
            const targetPair = pairs.find((p) => p.userNode.id === e.target)
            if (!targetPair) continue

            const sourcePairId = pairIdByAnchorNodeId.get(e.source)
            if (!sourcePairId) continue

            reactFlowEdges.push({
                id: `${e.id}`,
                source: sourcePairId,
                target: targetPair.id,
                type: 'smoothstep',
                markerEnd: { type: MarkerType.ArrowClosed, ...EDGE_MARKER },
                style: EDGE_STYLE,
                animated: false,
            })
        }

        // Local edges from parent QA pair to draft nodes
        for (const draft of drafts) {
            const sourceAnchors =
                draft.fromNodeIds && draft.fromNodeIds.length
                    ? draft.fromNodeIds
                    : draft.anchorNodeId
                        ? [draft.anchorNodeId]
                        : []

            for (const anchorId of sourceAnchors) {
                const sourcePairId = pairIdByAnchorNodeId.get(anchorId)
                if (!sourcePairId) continue

                reactFlowEdges.push({
                    id: `draft-edge-${draft.id}-${sourcePairId}`,
                    source: sourcePairId,
                    target: draft.id,
                    type: 'smoothstep',
                    markerEnd: { type: MarkerType.ArrowClosed, ...EDGE_MARKER },
                    style: EDGE_STYLE,
                    animated: false,
                })
            }
        }

        return { computedNodes: reactFlowNodes, edges: reactFlowEdges, pairs }
    }, [
        graph,
        zoomedNodeId,
        drafts,
        handleSendFromDraft,
        createDraftBelow,
        handleEditNode,
        selectedAnchorNodeIds,
        selectionMode,
        isLockMode,
        handleToggleLockMode,
        handleTextSelected,
        getNodes,
    ])

    return result
}
