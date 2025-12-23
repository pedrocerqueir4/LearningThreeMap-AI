import { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from 'reactflow'
import type { Node } from 'reactflow'
import 'reactflow/dist/style.css'

import type { GraphEdge, GraphNode } from '../store/graph'
import type { QaNodeData } from '../types'
import { useGraphStore } from '../store/graph'
import { QaNode } from './QaNode'
import { useDraftNodes } from '../hooks/useDraftNodes'
import { useSelectionMode } from '../hooks/useSelectionMode'
import { useEditMode } from '../hooks/useEditMode'
import { REACT_FLOW_CONFIG } from '../constants/graph'
import * as api from '../services/api'

// Moved components
import { ExpandedChat } from './graph/ExpandedChat'
import { GraphToolbar } from './graph/GraphToolbar'
import { TextSelectionMenu } from './graph/TextSelectionMenu'
import { DeleteConfirmModal } from './graph/DeleteConfirmModal'

// Moved types
import type { Pair } from './graph/types'

// Moved hooks
import { useGraphNodes } from '../hooks/graph/useGraphNodes'
import { useViewportPersistence } from '../hooks/graph/useViewportPersistence'
import { useNodePositionSaver } from '../hooks/graph/useNodePositionSaver'

export type ConversationGraphProps = {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] } | null
  conversationId: string
  onSendFromNode: (
    fromNodeIds: string[] | null,
    content: string,
    draftNodeId?: string | null,
    position?: { x: number; y: number } | null
  ) => Promise<void>
}

const nodeTypes = { qa: QaNode }

function InnerConversationGraph({
  graph,
  conversationId,
  onSendFromNode,
}: ConversationGraphProps) {
  const { fitView, getNodes, getViewport, setViewport } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<QaNodeData>([])
  const [zoomedNodeId, setZoomedNodeId] = useState<string | null>(null)
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  // Lock mode for text selection feature
  const [isLockMode, setIsLockMode] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{
    x: number
    y: number
  } | null>(null)

  // Chat in node selection mode
  const [isChatInNodeMode, setIsChatInNodeMode] = useState(false)
  const [pendingContextText, setPendingContextText] = useState<string | null>(
    null
  )

  // Ref to save viewport state before entering chat mode (for restoration when closing)
  const viewportBeforeChatModeRef = useRef<{
    x: number
    y: number
    zoom: number
  } | null>(null)

  // Ref to track that we need to restore viewport after exiting chat mode
  const shouldRestoreViewportRef = useRef(false)

  const { fetchGraph } = useGraphStore()

  const {
    drafts,
    createDraft,
    createDraftBelow,
    removeDraft,
    removeDraftsByAnchorIds,
    addDraftContext,
  } = useDraftNodes(conversationId)
  const {
    selectionMode,
    selectedAnchorNodeIds,
    setSelectionMode,
    toggleNodeSelection,
    clearSelection,
  } = useSelectionMode(conversationId)
  const chatEdit = useEditMode()

  const { onMoveEnd } = useViewportPersistence(conversationId)
  const { onNodeDragStop } = useNodePositionSaver(conversationId)

  const handleSendFromDraft = useCallback(
    async (
      fromNodeIds: string[] | null,
      content: string,
      draftId: string
    ) => {
      const draftNode = getNodes().find((n) => n.id === draftId)
      const position = draftNode
        ? { x: draftNode.position.x, y: draftNode.position.y }
        : null
      await onSendFromNode(fromNodeIds, content, draftId, position)
      removeDraft(draftId)
    },
    [onSendFromNode, removeDraft, getNodes]
  )

  const handleEditNode = useCallback(
    async (nodeId: string, newContent: string) => {
      await api.updateNode(conversationId, nodeId, newContent)
      await fetchGraph(conversationId)
    },
    [conversationId, fetchGraph]
  )

  const handleToggleLockMode = useCallback(() => {
    setIsLockMode((prev) => !prev)
    // Clear selection when toggling off
    if (isLockMode) {
      setSelectedNodeId(null)
      setDropdownPosition(null)
      window.getSelection()?.removeAllRanges()
    }
  }, [isLockMode])

  const handleTextSelected = useCallback((nodeId: string, rect: DOMRect) => {
    // Only store the node ID and position, NOT the text itself
    setSelectedNodeId(nodeId)
    setDropdownPosition({
      x: rect.left + rect.width / 2,
      y: rect.bottom + 8,
    })
  }, [])

  // Use the hook to get graph nodes/edges/pairs
  const { computedNodes, edges, pairs } = useGraphNodes({
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
  })

  // Close dropdown handler
  const handleCloseDropdown = useCallback(() => {
    setSelectedNodeId(null)
    setDropdownPosition(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  // handleAskAboutSelection needs access to pairs
  const handleAskAboutSelection = useCallback(() => {
    const nodeId = selectedNodeId
    setSelectedNodeId(null)
    setDropdownPosition(null)

    if (!nodeId) return

    const selection = window.getSelection()
    const text = selection?.toString().trim()
    window.getSelection()?.removeAllRanges()

    if (!text) return

    const pair = pairs.find((p) => p.id === nodeId)
    const anchorNodeId = pair?.anchorNodeId ?? nodeId

    createDraft(anchorNodeId, [anchorNodeId], text)
    setIsLockMode(false)
  }, [selectedNodeId, pairs, createDraft])

  const handleChatInNodeSelection = useCallback(() => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()

    if (!text) return

    setPendingContextText(text)
    setIsChatInNodeMode(true)

    setSelectedNodeId(null)
    setDropdownPosition(null)
    window.getSelection()?.removeAllRanges()
    setIsLockMode(false)
  }, [])

  const handleDraftClickForContext = useCallback(
    (draftId: string) => {
      if (isChatInNodeMode && pendingContextText) {
        addDraftContext(draftId, pendingContextText)
        setIsChatInNodeMode(false)
        setPendingContextText(null)
        setIsLockMode(false)
      }
    },
    [isChatInNodeMode, pendingContextText, addDraftContext]
  )

  const handleCancelChatInNodeMode = useCallback(() => {
    setIsChatInNodeMode(false)
    setPendingContextText(null)
  }, [])

  // Sync React Flow nodes
  useEffect(() => {
    setNodes((prevNodes) => {
      return computedNodes.map((node) => {
        const existing = prevNodes.find((prev) => prev.id === node.id)
        return existing ? { ...node, position: existing.position } : node
      })
    })
  }, [computedNodes, setNodes])

  // Track previous expandedNodeId to detect when exiting chat mode
  const prevExpandedNodeIdRef = useRef<string | null>(null)

  // Restore viewport when exiting chat mode
  useEffect(() => {
    const wasExpanded = prevExpandedNodeIdRef.current !== null
    const isNowCollapsed = expandedNodeId === null

    if (wasExpanded && isNowCollapsed && shouldRestoreViewportRef.current) {
      const timeoutId = setTimeout(() => {
        if (viewportBeforeChatModeRef.current) {
          setViewport(viewportBeforeChatModeRef.current, { duration: 200 })
          viewportBeforeChatModeRef.current = null
        }
        shouldRestoreViewportRef.current = false
      }, 50)
      return () => clearTimeout(timeoutId)
    }

    prevExpandedNodeIdRef.current = expandedNodeId
  }, [expandedNodeId, setViewport])

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node<QaNodeData>) => {
      if (!expandedNodeId) {
        viewportBeforeChatModeRef.current = getViewport()
        shouldRestoreViewportRef.current = true
      }
      setExpandedNodeId((current) => (current === node.id ? null : node.id))
    },
    [expandedNodeId, getViewport]
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<QaNodeData>) => {
      if (isChatInNodeMode && node.data.mode === 'draft') {
        handleDraftClickForContext(node.id)
        return
      }

      if (selectionMode === 'none') return

      const anchor = node.data.anchorNodeId ?? node.id
      toggleNodeSelection(anchor)
    },
    [
      toggleNodeSelection,
      selectionMode,
      isChatInNodeMode,
      handleDraftClickForContext,
    ]
  )

  const onPaneClick = useCallback(() => {
    setZoomedNodeId(null)
    clearSelection()
  }, [clearSelection])

  const onPaneDoubleClick = useCallback(() => {
    fitView({ padding: REACT_FLOW_CONFIG.fitViewPadding, duration: 200 })
  }, [fitView])

  const onInit = useCallback(() => { }, [])

  const handleToggleAskSelection = useCallback(() => {
    if (selectionMode !== 'ask') {
      setSelectionMode('ask')
      return
    }

    if (!selectedAnchorNodeIds.length) {
      setSelectionMode('none')
      return
    }

    const anchorNodeId = selectedAnchorNodeIds[0] ?? null
    const fromNodeIds = [...selectedAnchorNodeIds]

    createDraft(anchorNodeId, fromNodeIds)
    clearSelection()
  }, [
    selectionMode,
    selectedAnchorNodeIds,
    setSelectionMode,
    createDraft,
    clearSelection,
  ])

  const handleToggleDeleteSelection = useCallback(() => {
    if (selectionMode !== 'delete') {
      setSelectionMode('delete')
      return
    }

    if (!selectedAnchorNodeIds.length) {
      setSelectionMode('none')
      return
    }

    setIsDeleteConfirmOpen(true)
  }, [selectionMode, selectedAnchorNodeIds, setSelectionMode])

  const handleConfirmDelete = useCallback(async () => {
    if (!selectedAnchorNodeIds.length) {
      setIsDeleteConfirmOpen(false)
      setSelectionMode('none')
      return
    }

    try {
      const rawNodes = graph?.nodes ?? []
      const rawEdges = graph?.edges ?? []
      const nodeById = new Map<string, GraphNode>()
      for (const n of rawNodes) nodeById.set(n.id, n)

      const resolveRootId = (anchorId: string): string => {
        const anchorNode = nodeById.get(anchorId)
        if (!anchorNode) return anchorId
        if (anchorNode.type === 'user') return anchorId

        const incoming = rawEdges.filter((e) => e.target === anchorId)
        for (const e of incoming) {
          const src = nodeById.get(e.source)
          if (src?.type === 'user') {
            return src.id
          }
        }
        return anchorId
      }

      const rootIds = Array.from(
        new Set(selectedAnchorNodeIds.map(resolveRootId))
      )

      for (const nodeId of rootIds) {
        await api.deleteNode(conversationId, nodeId)
      }

      await fetchGraph(conversationId)
      removeDraftsByAnchorIds(selectedAnchorNodeIds)
    } catch {
      // Error handling
    }

    setIsDeleteConfirmOpen(false)
    clearSelection()
  }, [
    selectedAnchorNodeIds,
    conversationId,
    fetchGraph,
    graph,
    clearSelection,
    removeDraftsByAnchorIds,
  ])

  const handleCancelDelete = useCallback(() => {
    setIsDeleteConfirmOpen(false)
    clearSelection()
  }, [clearSelection])

  const handleCreateRootDraft = useCallback(() => {
    createDraftBelow('', null)
    setTimeout(() => {
      fitView({ duration: 300 })
    }, 50)
  }, [fitView, createDraftBelow])

  const expandedPair = expandedNodeId
    ? pairs.find((p) => p.id === expandedNodeId)
    : undefined
  const expandedDraft = expandedNodeId
    ? drafts.find((d) => d.id === expandedNodeId)
    : undefined
  const isExpanded = !!expandedPair || !!expandedDraft

  const getAdjacentNodes = useCallback(() => {
    if (!expandedPair || !graph) return { parentPairs: [], childPairs: [] }

    const rawEdges = graph.edges
    const pairById = new Map<string, Pair>()
    for (const p of pairs) {
      pairById.set(p.id, p)
    }

    const pairIdByAnchorNodeId = new Map<string, string>()
    for (const p of pairs) {
      pairIdByAnchorNodeId.set(p.anchorNodeId, p.id)
    }

    const parentPairs: Pair[] = []
    for (const edge of rawEdges) {
      if (edge.target === expandedPair.userNode.id) {
        const parentPairId = pairIdByAnchorNodeId.get(edge.source)
        if (parentPairId) {
          const parentPair = pairById.get(parentPairId)
          if (parentPair && !parentPairs.some((p) => p.id === parentPairId)) {
            parentPairs.push(parentPair)
          }
        }
      }
    }

    const childPairs: Pair[] = []
    for (const edge of rawEdges) {
      if (edge.source === expandedPair.anchorNodeId) {
        const childPair = pairById.get(edge.target)
        if (childPair && !childPairs.some((p) => p.id === edge.target)) {
          childPairs.push(childPair)
        }
      }
    }

    return { parentPairs, childPairs }
  }, [expandedPair, graph, pairs])

  const { parentPairs, childPairs } = getAdjacentNodes()

  return (
    <div className="graph-shell">
      {isExpanded ? (
        <ExpandedChat
          expandedPair={expandedPair}
          expandedDraft={expandedDraft}
          parentPairs={parentPairs}
          childPairs={childPairs}
          chatEdit={chatEdit}
          onClose={() => setExpandedNodeId(null)}
          onNavigate={setExpandedNodeId}
          onSendDraft={handleSendFromDraft}
          onSaveEdit={handleEditNode}
        />
      ) : (
        <>
          <div
            className="graph-flow"
            style={{
              cursor:
                selectionMode === 'ask'
                  ? 'help'
                  : selectionMode === 'delete'
                    ? 'not-allowed'
                    : 'auto',
            }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onInit={onInit}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={onPaneClick}
              onDoubleClick={onPaneDoubleClick}
              onNodeDragStop={onNodeDragStop}
              onNodesChange={onNodesChange}
              onMoveEnd={onMoveEnd}
              elementsSelectable={false}
              nodesDraggable={!isLockMode}
              panOnDrag={!isLockMode}
              zoomOnScroll={!isLockMode}
              proOptions={{ hideAttribution: true }}
              style={{ width: '100%', height: '100%' }}
              minZoom={REACT_FLOW_CONFIG.minZoom}
              maxZoom={REACT_FLOW_CONFIG.maxZoom}
            >
              <Background gap={16} color="#e5e7eb" />
              <Controls />
            </ReactFlow>
          </div>

          {/* Chat in node selection mode banner */}
          {isChatInNodeMode && (
            <div className="chat-in-node-banner">
              <span>Click a draft node to add context</span>
              <button type="button" onClick={handleCancelChatInNodeMode}>
                Cancel
              </button>
            </div>
          )}

          <GraphToolbar
            selectionMode={selectionMode}
            onToggleAsk={handleToggleAskSelection}
            onToggleDelete={handleToggleDeleteSelection}
            onCreateRoot={handleCreateRootDraft}
          />
        </>
      )}

      <DeleteConfirmModal
        isOpen={isDeleteConfirmOpen}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <TextSelectionMenu
        position={dropdownPosition}
        onAskAbout={handleAskAboutSelection}
        onChatInNode={handleChatInNodeSelection}
        onCancel={handleCloseDropdown}
        hasDrafts={drafts.length > 0}
      />
    </div>
  )
}

export function ConversationGraph(props: ConversationGraphProps) {
  return (
    <ReactFlowProvider>
      <InnerConversationGraph {...props} />
    </ReactFlowProvider>
  )
}
