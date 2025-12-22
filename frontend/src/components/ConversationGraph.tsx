import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
} from 'reactflow'
import type { Edge, Node } from 'reactflow'
import 'reactflow/dist/style.css'
import ReactMarkdown from 'react-markdown'

import type { GraphEdge, GraphNode } from '../store/graph'
import type { QaNodeData } from '../types'
import { useGraphStore } from '../store/graph'
import { QaNode } from './QaNode'
import { useDraftNodes } from '../hooks/useDraftNodes'
import { useSelectionMode } from '../hooks/useSelectionMode'
import { useEditMode } from '../hooks/useEditMode'
import { markdownComponents, remarkPlugins, rehypePlugins } from '../utils/markdown'
import { findFreePositionAABB, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '../utils/position'
import type { NodeRect } from '../utils/position'
import { EDGE_STYLE, EDGE_MARKER, REACT_FLOW_CONFIG } from '../constants/graph'
import * as api from '../services/api'


export type ConversationGraphProps = {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] } | null
  conversationId: string
  onSendFromNode: (fromNodeIds: string[] | null, content: string, draftNodeId?: string | null, position?: { x: number; y: number } | null) => Promise<void>
}

const nodeTypes = { qa: QaNode }

type Pair = {
  id: string
  userNode: GraphNode
  aiNode: GraphNode | null
  anchorNodeId: string
}

function InnerConversationGraph({ graph, conversationId, onSendFromNode }: ConversationGraphProps) {
  const { fitView, getNodes, getViewport, setViewport } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<QaNodeData>([])
  const [zoomedNodeId, setZoomedNodeId] = useState<string | null>(null)
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  // Lock mode for text selection feature
  const [isLockMode, setIsLockMode] = useState(false)
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ x: number; y: number } | null>(null)

  // Chat in node selection mode
  const [isChatInNodeMode, setIsChatInNodeMode] = useState(false)
  const [pendingContextText, setPendingContextText] = useState<string | null>(null)


  // Ref to persist measured node dimensions across re-renders
  // This solves the timing issue where getNodes() returns undefined dimensions during re-renders
  const measuredDimensionsRef = useRef<Map<string, { width: number; height: number }>>(new Map())

  // Ref to track pending position updates (batched and sent when conversation changes)
  const pendingPositionUpdatesRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  // Ref to track the current conversationId so cleanup saves to the correct conversation
  const currentConversationIdRef = useRef(conversationId)

  // Ref to track if viewport has been restored for the current conversation
  const viewportRestoredRef = useRef(false)

  // Ref to save viewport state before entering chat mode (for restoration when closing)
  const viewportBeforeChatModeRef = useRef<{ x: number; y: number; zoom: number } | null>(null)

  // Ref to track that we need to restore viewport after exiting chat mode
  const shouldRestoreViewportRef = useRef(false)

  const { updateNodePositions, fetchGraph } = useGraphStore()

  const { drafts, createDraft, createDraftBelow, removeDraft, removeDraftsByAnchorIds, addDraftContext } = useDraftNodes(conversationId)
  const { selectionMode, selectedAnchorNodeIds, setSelectionMode, toggleNodeSelection, clearSelection } =
    useSelectionMode(conversationId)
  const chatEdit = useEditMode()

  const handleSendFromDraft = useCallback(
    async (fromNodeIds: string[] | null, content: string, draftId: string) => {
      const draftNode = getNodes().find((n) => n.id === draftId)
      const position = draftNode ? { x: draftNode.position.x, y: draftNode.position.y } : null
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
      setSelectedText(null)
      setSelectedNodeId(null)
      setDropdownPosition(null)
    }
  }, [isLockMode])

  const handleTextSelected = useCallback(
    (text: string, nodeId: string) => {
      // Get the selection position from browser
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0) return

      const range = selection.getRangeAt(0)
      const rect = range.getBoundingClientRect()

      setSelectedText(text)
      setSelectedNodeId(nodeId)
      setDropdownPosition({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 8,
      })
    },
    []
  )

  // handleAskAboutSelection is defined after useMemo since it depends on pairs

  const handleCloseDropdown = useCallback(() => {
    setSelectedText(null)
    setSelectedNodeId(null)
    setDropdownPosition(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  const { computedNodes, edges, pairs } = useMemo(() => {
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
    pairs.sort((a, b) => a.userNode.created_at.localeCompare(b.userNode.created_at))

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

      if (anchorGraphNode && anchorGraphNode.pos_x != null && anchorGraphNode.pos_y != null) {
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
        selected: selectionMode !== 'none' && selectedAnchorNodeIds.includes(p.anchorNodeId),
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
        selected: selectionMode !== 'none' && selectedAnchorNodeIds.includes(draft.anchorNodeId ?? draft.id),
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
  ])

  // handleAskAboutSelection needs to be defined after useMemo since it uses pairs
  const handleAskAboutSelection = useCallback(() => {
    if (!selectedText || !selectedNodeId) return

    // Find the anchor node ID for the selected node
    const pair = pairs.find((p) => p.id === selectedNodeId)
    const anchorNodeId = pair?.anchorNodeId ?? selectedNodeId

    // Create a draft with the selected text as context
    createDraft(anchorNodeId, [anchorNodeId], selectedText)

    // Clear selection state
    setSelectedText(null)
    setSelectedNodeId(null)
    setDropdownPosition(null)
    window.getSelection()?.removeAllRanges()

    // Auto-unlock after selecting an option
    setIsLockMode(false)
  }, [selectedText, selectedNodeId, pairs, createDraft])

  // Handler for "Chat in node..." option - enters selection mode for picking a draft
  const handleChatInNodeSelection = useCallback(() => {
    if (!selectedText) return

    // Store the context text and enter selection mode
    setPendingContextText(selectedText)
    setIsChatInNodeMode(true)

    // Close the dropdown
    setSelectedText(null)
    setSelectedNodeId(null)
    setDropdownPosition(null)
    window.getSelection()?.removeAllRanges()

    // Unlock movement so user can pan/navigate while selecting a draft node
    setIsLockMode(false)
  }, [selectedText])

  // Handler for clicking a draft node while in chat-in-node mode
  const handleDraftClickForContext = useCallback(
    (draftId: string) => {
      if (isChatInNodeMode && pendingContextText) {
        addDraftContext(draftId, pendingContextText)
        setIsChatInNodeMode(false)
        setPendingContextText(null)

        // Auto-unlock after selecting an option
        setIsLockMode(false)
      }
    },
    [isChatInNodeMode, pendingContextText, addDraftContext]
  )

  // Cancel chat-in-node mode
  const handleCancelChatInNodeMode = useCallback(() => {
    setIsChatInNodeMode(false)
    setPendingContextText(null)
  }, [])

  useEffect(() => {
    setNodes((prevNodes) => {
      return computedNodes.map((node) => {
        const existing = prevNodes.find((prev) => prev.id === node.id)
        return existing ? { ...node, position: existing.position } : node
      })
    })
  }, [computedNodes, setNodes])

  useEffect(() => {
    if (!expandedNodeId) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setExpandedNodeId(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [expandedNodeId])

  useEffect(() => {
    if (!expandedNodeId) return
    const body = document.querySelector('.graph-expanded-chat-body')
    if (body instanceof HTMLElement) {
      body.scrollTop = 0
    }
  }, [expandedNodeId])

  // Reset edit state when expanding/collapsing
  useEffect(() => {
    chatEdit.setEditContent('')
    chatEdit.setError(null)
  }, [expandedNodeId])

  // Track previous expandedNodeId to detect when exiting chat mode
  const prevExpandedNodeIdRef = useRef<string | null>(null)

  // Restore viewport when exiting chat mode (after graph is visible again)
  useEffect(() => {
    const wasExpanded = prevExpandedNodeIdRef.current !== null
    const isNowCollapsed = expandedNodeId === null

    // Detect transition from expanded to collapsed (exiting chat mode)
    if (wasExpanded && isNowCollapsed && shouldRestoreViewportRef.current) {
      // Small delay to ensure ReactFlow has rendered
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
      // Save current viewport before entering chat mode
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
      // Handle chat-in-node mode: clicking a draft node adds context text
      if (isChatInNodeMode && node.data.mode === 'draft') {
        handleDraftClickForContext(node.id)
        return
      }

      // Only allow selection when in 'ask' or 'delete' mode
      if (selectionMode === 'none') return

      const anchor = node.data.anchorNodeId ?? node.id
      toggleNodeSelection(anchor)
    },
    [toggleNodeSelection, selectionMode, isChatInNodeMode, handleDraftClickForContext]
  )

  const onPaneClick = useCallback(() => {
    setZoomedNodeId(null)
    clearSelection()
  }, [clearSelection])

  // Handle double-click on the pane (outside nodes) to zoom in/fit view
  const onPaneDoubleClick = useCallback(() => {
    fitView({ padding: REACT_FLOW_CONFIG.fitViewPadding, duration: 200 })
  }, [fitView])

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

      // Flush pending viewport update to the DEPARTING conversation
      // Only save if we have actually restored/interacted with the viewport
      if (viewportRestoredRef.current) {
        const currentViewport = getViewport()
        void api.updateConversationViewport(departingConversationId, {
          x: currentViewport.x,
          y: currentViewport.y,
          zoom: currentViewport.zoom,
        })
      }
    }
  }, [conversationId, updateNodePositions, getViewport])

  // Restore viewport from conversation data when loading
  // Debounce reference for saving viewport
  const saveViewportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Save viewport with debounce (waits 500ms after last change)
  const debouncedSaveViewport = useCallback(() => {
    // Don't save if we haven't restored the viewport yet (prevents overwriting with 0,0,1)
    if (!viewportRestoredRef.current) {
      return
    }

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

  useEffect(() => {
    // Skip if already restored for this conversation
    if (viewportRestoredRef.current) {
      return
    }

    // Fetch the conversation data to get the latest viewport values
    const restoreViewport = async () => {
      try {

        const conversation = await api.getConversation(conversationId)


        if (
          conversation &&
          typeof conversation.viewport_x === 'number' &&
          typeof conversation.viewport_y === 'number' &&
          typeof conversation.viewport_zoom === 'number'
        ) {
          // Restore saved viewport
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

  // Reset the restoration flag when conversation changes
  useEffect(() => {
    return () => {
      // When conversation changes (cleanup), reset the flag for next conversation
      viewportRestoredRef.current = false
    }
  }, [conversationId])


  const onInit = useCallback(() => {
    // Viewport restoration is handled by the restoreViewport effect
    // This callback is intentionally empty to prevent any automatic fitView
  }, [])

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

    // Use createDraft to properly handle multiple parent nodes
    createDraft(anchorNodeId, fromNodeIds)
    clearSelection()
  }, [selectionMode, selectedAnchorNodeIds, setSelectionMode, createDraft, clearSelection])

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

      const rootIds = Array.from(new Set(selectedAnchorNodeIds.map(resolveRootId)))

      for (const nodeId of rootIds) {
        await api.deleteNode(conversationId, nodeId)
      }

      await fetchGraph(conversationId)
      removeDraftsByAnchorIds(selectedAnchorNodeIds)
    } catch {
      // Error handling could be improved here
    }

    setIsDeleteConfirmOpen(false)
    clearSelection()
  }, [selectedAnchorNodeIds, conversationId, fetchGraph, graph, clearSelection, removeDraftsByAnchorIds])

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

  const expandedPair = expandedNodeId ? pairs.find((p) => p.id === expandedNodeId) : undefined
  const expandedDraft = expandedNodeId ? drafts.find((d) => d.id === expandedNodeId) : undefined
  const isExpanded = !!expandedPair || !!expandedDraft

  // Navigation logic for expanded view
  const getAdjacentNodes = useCallback(() => {
    if (!expandedPair || !graph) return { parentPairs: [], childPairs: [] }

    const rawEdges = graph.edges
    const pairById = new Map<string, typeof pairs[0]>()
    for (const p of pairs) {
      pairById.set(p.id, p)
    }

    const pairIdByAnchorNodeId = new Map<string, string>()
    for (const p of pairs) {
      pairIdByAnchorNodeId.set(p.anchorNodeId, p.id)
    }

    const parentPairs: typeof pairs = []
    for (const edge of rawEdges) {
      if (edge.target === expandedPair.userNode.id) {
        const parentPairId = pairIdByAnchorNodeId.get(edge.source)
        if (parentPairId) {
          const parentPair = pairById.get(parentPairId)
          if (parentPair && !parentPairs.some(p => p.id === parentPairId)) {
            parentPairs.push(parentPair)
          }
        }
      }
    }

    const childPairs: typeof pairs = []
    for (const edge of rawEdges) {
      if (edge.source === expandedPair.anchorNodeId) {
        const childPair = pairById.get(edge.target)
        if (childPair && !childPairs.some(p => p.id === edge.target)) {
          childPairs.push(childPair)
        }
      }
    }

    return { parentPairs, childPairs }
  }, [expandedPair, graph, pairs])

  const { parentPairs, childPairs } = getAdjacentNodes()

  const saveChatEdit = useCallback(async () => {
    if (!expandedPair) return
    await chatEdit.saveEdit(
      async (content) => await handleEditNode(expandedPair.id, content),
      expandedPair.userNode.label
    )
  }, [expandedPair, chatEdit, handleEditNode])

  return (
    <div className="graph-shell">
      {isExpanded ? (
        <div className="graph-expanded-chat">
          <div className="graph-expanded-chat-header">
            <button
              type="button"
              className="graph-expanded-close-button"
              onClick={() => setExpandedNodeId(null)}
            >
              Close chat
            </button>
          </div>
          <div className="graph-expanded-chat-body">
            {/* Navigation dots for parent nodes (above) */}
            {parentPairs.length > 0 && (
              <div className="graph-nav-dots-container graph-nav-dots-container--top">
                {parentPairs.map((pair) => (
                  <button
                    key={pair.id}
                    type="button"
                    className="graph-nav-dot"
                    onClick={() => setExpandedNodeId(pair.id)}
                    title={pair.userNode.label.length > 50 ? pair.userNode.label.substring(0, 50) + '...' : pair.userNode.label}
                    aria-label={`Navigate to: ${pair.userNode.label.substring(0, 50)}`}
                  />
                ))}
              </div>
            )}

            {expandedPair && (
              <div
                key={expandedPair.id}
                id={`expanded-pair-${expandedPair.id}`}
                className="graph-expanded-chat-item"
              >
                {chatEdit.isEditing ? (
                  <div className="qa-node-edit-container">
                    <input
                      className="qa-node-input qa-node-input--chat-mode"
                      value={chatEdit.editContent}
                      onChange={(e) => chatEdit.setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          saveChatEdit()
                        } else if (e.key === 'Escape') {
                          chatEdit.cancelEditing()
                        }
                      }}
                      disabled={chatEdit.isSaving}
                      autoFocus
                      placeholder="Edit your message..."
                    />
                    <div className="qa-node-edit-actions">
                      <button
                        className="qa-node-edit-cancel"
                        onClick={chatEdit.cancelEditing}
                        disabled={chatEdit.isSaving}
                      >
                        Cancel
                      </button>
                      <button
                        className="qa-node-edit-save"
                        onClick={saveChatEdit}
                        disabled={chatEdit.isSaving || !chatEdit.editContent.trim()}
                      >
                        {chatEdit.isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    {chatEdit.error && <div className="qa-node-error">{chatEdit.error}</div>}
                  </div>
                ) : (
                  <>
                    <div className="qa-bubble-row">
                      <div className="qa-bubble qa-bubble--user">{expandedPair.userNode.label}</div>
                      <button
                        className="qa-node-edit-icon"
                        onClick={() => chatEdit.startEditing(expandedPair.userNode.label)}
                        title="Edit message"
                      >
                        ✎
                      </button>
                    </div>
                    {expandedPair.aiNode && (
                      <div className="qa-bubble qa-bubble--ai">
                        <ReactMarkdown
                          components={markdownComponents}
                          remarkPlugins={remarkPlugins}
                          rehypePlugins={rehypePlugins}
                        >
                          {expandedPair.aiNode.label}
                        </ReactMarkdown>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {expandedDraft && (
              <div className="graph-expanded-chat-item">
                <div className="qa-node-input-only">
                  <input
                    className="qa-node-input qa-node-input--chat-mode"
                    placeholder="Ask a question..."
                    value={chatEdit.editContent}
                    onChange={(e) => chatEdit.setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && chatEdit.editContent.trim()) {
                        e.preventDefault()
                        if (expandedDraft && chatEdit.editContent.trim()) {
                          chatEdit.setError(null)
                          handleSendFromDraft(expandedDraft.fromNodeIds, chatEdit.editContent, expandedDraft.id)
                            .catch(() => chatEdit.setError('Failed to send'))
                        }
                      }
                    }}
                    disabled={chatEdit.isSaving}
                    autoFocus
                  />
                  <div className="qa-node-edit-actions">
                    <button
                      className="qa-node-send-button"
                      onClick={() => {
                        if (expandedDraft && chatEdit.editContent.trim()) {
                          chatEdit.setError(null)
                          handleSendFromDraft(expandedDraft.fromNodeIds, chatEdit.editContent, expandedDraft.id)
                            .catch(() => chatEdit.setError('Failed to send'))
                        }
                      }}
                      disabled={chatEdit.isSaving || !chatEdit.editContent.trim()}
                      style={{ marginTop: '0.5rem' }}
                    >
                      {chatEdit.isSaving ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                  {chatEdit.error && <div className="qa-node-error">{chatEdit.error}</div>}
                </div>
              </div>
            )}

            {/* Navigation dots for child nodes (below) */}
            {childPairs.length > 0 && (
              <div className="graph-nav-dots-container graph-nav-dots-container--bottom">
                {childPairs.map((pair) => (
                  <button
                    key={pair.id}
                    type="button"
                    className="graph-nav-dot"
                    onClick={() => setExpandedNodeId(pair.id)}
                    title={pair.userNode.label.length > 50 ? pair.userNode.label.substring(0, 50) + '...' : pair.userNode.label}
                    aria-label={`Navigate to: ${pair.userNode.label.substring(0, 50)}`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
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
          <div className="graph-toolbar">
            <button
              type="button"
              className="graph-toolbar-button"
              onClick={handleCreateRootDraft}
            >
              <span className="graph-toolbar-button-icon">+</span>
              <span className="graph-toolbar-button-label">New starting node</span>
            </button>
            <button
              type="button"
              className={
                selectionMode === 'ask'
                  ? 'graph-toolbar-button graph-toolbar-button--active'
                  : 'graph-toolbar-button'
              }
              onClick={handleToggleAskSelection}
            >
              <span className="graph-toolbar-button-icon">?</span>
              <span className="graph-toolbar-button-label">
                {selectionMode === 'ask' ? 'Confirm selection' : 'Ask about selection'}
              </span>
            </button>
            <button
              type="button"
              className={
                selectionMode === 'delete'
                  ? 'graph-toolbar-button graph-toolbar-button--active'
                  : 'graph-toolbar-button'
              }
              onClick={handleToggleDeleteSelection}
            >
              <span className="graph-toolbar-button-icon">
                {selectionMode === 'delete' ? '✓' : '×'}
              </span>
              <span className="graph-toolbar-button-label">
                {selectionMode === 'delete' ? 'Confirm delete' : 'Delete node'}
              </span>
            </button>
          </div>
        </>
      )}
      {isDeleteConfirmOpen && (
        <div className="delete-modal-backdrop">
          <div className="delete-modal" role="dialog" aria-modal="true">
            <div className="delete-modal-title">Delete selected nodes?</div>
            <div className="delete-modal-body">
              This will delete the selected node(s) and their downstream nodes. Nodes that also have other parents will
              be kept.
            </div>
            <div className="delete-modal-actions">
              <button
                type="button"
                className="delete-modal-button delete-modal-button--secondary"
                onClick={handleCancelDelete}
              >
                Cancel
              </button>
              <button
                type="button"
                className="delete-modal-button delete-modal-button--danger"
                onClick={handleConfirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Text selection dropdown */}
      {dropdownPosition && selectedText && (
        <div
          className="qa-selection-dropdown"
          style={{
            left: dropdownPosition.x,
            top: dropdownPosition.y,
            transform: 'translateX(-50%)',
          }}
        >
          <button
            type="button"
            className="qa-selection-dropdown-item"
            onClick={handleAskAboutSelection}
          >
            <span className="qa-selection-dropdown-item-icon">?</span>
            Ask about
          </button>
          <button
            type="button"
            className={`qa-selection-dropdown-item${drafts.length === 0 ? ' disabled' : ''}`}
            onClick={handleChatInNodeSelection}
            disabled={drafts.length === 0}
          >
            <span className="qa-selection-dropdown-item-icon">💬</span>
            Chat in node...
          </button>
          <button
            type="button"
            className="qa-selection-dropdown-item"
            onClick={handleCloseDropdown}
          >
            <span className="qa-selection-dropdown-item-icon">×</span>
            Cancel
          </button>
        </div>
      )}
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
