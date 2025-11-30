import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  ReactFlowProvider,
  useNodesState,
  useReactFlow,
  Handle,
  Position,
} from 'reactflow'
import type { Edge, Node, NodeProps } from 'reactflow'
import 'reactflow/dist/style.css'
import ReactMarkdown from 'react-markdown'

import type { GraphEdge, GraphNode } from '../store/graph'
import { useGraphStore } from '../store/graph'

export type ConversationGraphProps = {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] } | null
  conversationId: string
  onSendFromNode: (fromNodeIds: string[] | null, content: string, draftNodeId?: string | null) => Promise<void>
}

type QaNodeData = {
  id: string
  mode: 'draft' | 'complete'
  userText: string | null
  aiText: string | null
  anchorNodeId: string | null
  fromNodeIds: string[] | null
  onSend: (fromNodeIds: string[] | null, content: string, draftId: string) => Promise<void>
  onCreateDraftBelow: (nodeId: string, anchorNodeId: string | null) => void
  onEdit: (nodeId: string, newContent: string) => Promise<void>
  isZoomed: boolean
}

const QaNode = ({ data }: NodeProps<QaNodeData>) => {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)

  const isDraft = data.mode === 'draft'

  const handleSend = async () => {
    const text = draft.trim()
    if (!isDraft || !text || sending) return
    setSending(true)
    setError(null)
    try {
      const effectiveFromNodeIds =
        data.fromNodeIds && data.fromNodeIds.length
          ? data.fromNodeIds
          : data.anchorNodeId
            ? [data.anchorNodeId]
            : []
      await data.onSend(effectiveFromNodeIds.length ? effectiveFromNodeIds : null, text, data.id)
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  const startEditing = () => {
    setEditContent(data.userText || '')
    setIsEditing(true)
    setError(null)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditContent('')
    setError(null)
  }

  const saveEdit = async () => {
    const text = editContent.trim()
    if (!text || text === data.userText) {
      cancelEditing()
      return
    }

    setIsSavingEdit(true)
    setError(null)
    try {
      await data.onEdit(data.id, text)
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save edit')
    } finally {
      setIsSavingEdit(false)
    }
  }

  return (
    <div className={data.isZoomed ? 'qa-node qa-node--zoomed' : 'qa-node'}>
      <Handle type="target" position={Position.Top} className="qa-node-handle" />
      <Handle type="source" position={Position.Bottom} className="qa-node-handle" />
      {isDraft ? (
        <>
          {error && <div className="qa-node-error">{error}</div>}
          <div className="qa-node-input-only">
            <input
              className="qa-node-input qa-node-input--single"
              placeholder="Ask a question..."
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 500))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && draft.trim()) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              disabled={sending}
              maxLength={500}
            />
            <button
              className="qa-node-send-button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              type="button"
              title={sending ? 'Sending...' : 'Send message'}
            >
              {sending ? (
                <>
                  <span className="qa-node-send-spinner">⟳</span> Sending...
                </>
              ) : (
                <>
                  <span className="qa-node-send-plus">+</span> Send
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="qa-node-body">
            {isEditing ? (
              <div className="qa-node-edit-container">
                <input
                  className="qa-node-input"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      saveEdit()
                    } else if (e.key === 'Escape') {
                      cancelEditing()
                    }
                  }}
                  disabled={isSavingEdit}
                  autoFocus
                />
                <div className="qa-node-edit-actions">
                  <button
                    className="qa-node-edit-cancel"
                    onClick={cancelEditing}
                    disabled={isSavingEdit}
                  >
                    Cancel
                  </button>
                  <button
                    className="qa-node-edit-save"
                    onClick={saveEdit}
                    disabled={isSavingEdit || !editContent.trim()}
                  >
                    {isSavingEdit ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              data.userText && (
                <div className="qa-bubble-row">
                  <div className="qa-bubble qa-bubble--user">{data.userText}</div>
                  <button
                    className="qa-node-edit-icon"
                    onClick={startEditing}
                    title="Edit question"
                  >
                    ✎
                  </button>
                </div>
              )
            )}

            {data.aiText && !isEditing && (
              <div className="qa-bubble qa-bubble--ai">
                <ReactMarkdown
                  components={{
                    p: ({ children }: any) => <p style={{ margin: '0.25rem 0' }}>{children}</p>,
                    strong: ({ children }: any) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
                    em: ({ children }: any) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                    code: ({ children }: any) => (
                      <code style={{ backgroundColor: 'rgba(0, 0, 0, 0.1)', padding: '0.1rem 0.3rem', borderRadius: '0.2rem', fontFamily: 'monospace' }}>
                        {children}
                      </code>
                    ),
                    ul: ({ children }: any) => <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>{children}</ul>,
                    ol: ({ children }: any) => <ol style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>{children}</ol>,
                    li: ({ children }: any) => <li style={{ margin: '0.1rem 0' }}>{children}</li>,
                  }}
                >
                  {data.aiText}
                </ReactMarkdown>
              </div>
            )}
          </div>
          {error && <div className="qa-node-error">{error}</div>}
          <button
            type="button"
            className="qa-node-dot"
            onClick={() => data.onCreateDraftBelow(data.id, data.anchorNodeId ?? null)}
          >
            +
          </button>
        </>
      )}
    </div>
  )
}

const nodeTypes = { qa: QaNode }

type DraftNode = {
  id: string
  anchorNodeId: string | null
  fromNodeIds: string[]
}

function InnerConversationGraph({ graph, conversationId, onSendFromNode }: ConversationGraphProps) {
  const { fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<QaNodeData>([])
  const [zoomedNodeId, setZoomedNodeId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<DraftNode[]>([])
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null)
  const { updateNodePositions, fetchGraph } = useGraphStore()
  const [selectedAnchorNodeIds, setSelectedAnchorNodeIds] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState<'none' | 'ask' | 'delete'>('none')
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)

  // Reset drafts when conversation changes
  useEffect(() => {
    setDrafts([])
    setSelectedAnchorNodeIds([])
    setSelectionMode('none')
  }, [conversationId])

  const handleCreateDraftBelow = useCallback((nodeId: string, anchorNodeId: string | null) => {
    setDrafts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        anchorNodeId: anchorNodeId ?? nodeId,
        fromNodeIds: [anchorNodeId ?? nodeId],
      },
    ])
  }, [])


  const handleSendFromDraft = useCallback(
    async (fromNodeIds: string[] | null, content: string, draftId: string) => {
      await onSendFromNode(fromNodeIds, content, draftId)
      setDrafts((current) => current.filter((d) => d.id !== draftId))
    },
    [onSendFromNode],
  )

  const handleEditNode = useCallback(
    async (nodeId: string, newContent: string) => {
      const res = await fetch(`/api/graph/${conversationId}/nodes/${encodeURIComponent(nodeId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newContent }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(err.error || 'Failed to edit node')
      }

      await fetchGraph(conversationId)
    },
    [conversationId, fetchGraph],
  )

  const { computedNodes, edges, pairs } = useMemo(() => {
    const rawNodes = graph?.nodes ?? []
    const rawEdges = graph?.edges ?? []

    const nodeById = new Map<string, GraphNode>()
    for (const n of rawNodes) nodeById.set(n.id, n)

    // Group user + ai nodes into QA pairs
    type Pair = {
      id: string
      userNode: GraphNode
      aiNode: GraphNode | null
      anchorNodeId: string
    }

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

    // Ensure a stable chronological order for chat view.
    pairs.sort((a, b) => a.userNode.created_at.localeCompare(b.userNode.created_at))

    // Build mapping from graph node id -> pair id (for edges between pairs)
    const pairIdByAnchorNodeId = new Map<string, string>()
    for (const p of pairs) {
      pairIdByAnchorNodeId.set(p.anchorNodeId, p.id)
    }

    // Position nodes based on saved positions when available; otherwise fall back to a simple layout.
    const reactFlowNodes: Node<QaNodeData>[] = pairs.map((p, index) => {
      const fallbackPosition = { x: 0, y: index * 240 }
      const anchorGraphNode = nodeById.get(p.anchorNodeId)
      const position =
        anchorGraphNode && anchorGraphNode.pos_x != null && anchorGraphNode.pos_y != null
          ? { x: anchorGraphNode.pos_x, y: anchorGraphNode.pos_y }
          : fallbackPosition

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
          onCreateDraftBelow: handleCreateDraftBelow,
          onEdit: handleEditNode,
          isZoomed: zoomedNodeId === p.id,
        },
        selected: selectedAnchorNodeIds.includes(p.anchorNodeId),
      }
    })

    // Track occupied positions so we can place new draft nodes near their parent
    // without heavily overlapping existing nodes.
    const occupiedPositions: { x: number; y: number }[] = reactFlowNodes.map((n) => n.position)

    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y)

    // Node dimensions: QA nodes are roughly 260px wide and 120-180px tall
    // We need to account for this when checking collisions with draft nodes
    const NODE_HEIGHT = 180
    const MIN_DISTANCE = 280
    // Prioritize positioning draft nodes below the parent node
    const OFFSETS: { x: number; y: number }[] = [
      { x: 0, y: 220 },      // directly below
      { x: 0, y: 440 },      // further below
      { x: 260, y: 220 },    // below-right
      { x: -260, y: 220 },   // below-left
      { x: 260, y: 0 },      // right
      { x: -260, y: 0 },     // left
      { x: 0, y: -220 },     // above (last resort)
    ]

    const findFreePosition = (base: { x: number; y: number }) => {
      for (const offset of OFFSETS) {
        const candidate = { x: base.x + offset.x, y: base.y + offset.y }
        const collides = occupiedPositions.some((p) => distance(p, candidate) < MIN_DISTANCE)
        if (!collides) {
          occupiedPositions.push(candidate)
          return candidate
        }
      }

      // Fallback: push further down to avoid overlap with node box
      const candidate = { x: base.x, y: base.y + NODE_HEIGHT + 100 }
      occupiedPositions.push(candidate)
      return candidate
    }

    // Add local draft nodes (empty question boxes)
    const draftNodes: Node<QaNodeData>[] = drafts.map((draft, index) => {
      // Default stacking for root drafts (created from the bottom toolbar).
      let base = { x: 0, y: (pairs.length + index) * 220 }

      if (draft.anchorNodeId) {
        const sourcePairId = pairIdByAnchorNodeId.get(draft.anchorNodeId)
        if (sourcePairId) {
          const parentNode = reactFlowNodes.find((n) => n.id === sourcePairId)
          if (parentNode) {
            base = parentNode.position
          }
        }
      }

      const position = findFreePosition(base)

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
          onSend: handleSendFromDraft,
          onCreateDraftBelow: handleCreateDraftBelow,
          onEdit: handleEditNode,
          isZoomed: zoomedNodeId === draft.id,
        },
        selected: selectedAnchorNodeIds.includes(draft.anchorNodeId ?? draft.id),
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
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#111827' },
        style: { stroke: '#111827', strokeWidth: 2 },
        animated: false,
      })
    }

    // Local edges from parent QA pair to draft nodes, so new nodes are connected visually
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
          markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#111827' },
          style: { stroke: '#111827', strokeWidth: 2 },
          animated: false,
        })
      }
    }

    return { computedNodes: reactFlowNodes, edges: reactFlowEdges, pairs }
  }, [
    graph,
    zoomedNodeId,
    conversationId,
    drafts,
    handleSendFromDraft,
    handleCreateDraftBelow,
    handleEditNode,
    selectedAnchorNodeIds,
  ])

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

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node<QaNodeData>) => {
      setExpandedNodeId((current) => (current === node.id ? null : node.id))
    },
    [],
  )

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node<QaNodeData>) => {
      const anchor = node.data.anchorNodeId ?? node.id
      setSelectedAnchorNodeIds((current) => {
        if (selectionMode === 'none') {
          return current.includes(anchor) ? [] : [anchor]
        }
        const exists = current.includes(anchor)
        if (exists) {
          return current.filter((id) => id !== anchor)
        }
        return [...current, anchor]
      })
    },
    [selectionMode],
  )

  const onPaneClick = useCallback(() => {
    setZoomedNodeId(null)
    setSelectedAnchorNodeIds([])
    setSelectionMode('none')
    fitView({ padding: 0.2, duration: 200 })
  }, [fitView])

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node<QaNodeData>) => {
      if (node.data.mode !== 'complete') return

      const anchorNodeId = node.data.anchorNodeId ?? node.id

      void updateNodePositions(conversationId, [
        {
          nodeId: anchorNodeId,
          x: node.position.x,
          y: node.position.y,
        },
      ])
    },
    [conversationId, updateNodePositions],
  )

  // Ensure initial fit
  const onInit = useCallback(() => {
    if (computedNodes.length > 0) {
      fitView({ padding: 0.2 })
    }
  }, [fitView, computedNodes.length])

  const handleToggleAskSelection = useCallback(() => {
    if (selectionMode !== 'ask') {
      setSelectionMode('ask')
      setSelectedAnchorNodeIds([])
      return
    }

    if (!selectedAnchorNodeIds.length) {
      setSelectionMode('none')
      return
    }

    setDrafts((current) => {
      const anchorNodeId = selectedAnchorNodeIds[0] ?? null
      const fromNodeIds = [...selectedAnchorNodeIds]
      const newDraft = {
        id: `draft-${Math.random().toString(36).slice(2)}`,
        anchorNodeId,
        fromNodeIds,
      }
      return [...current, newDraft]
    })

    setSelectionMode('none')
    setSelectedAnchorNodeIds([])
  }, [selectionMode, selectedAnchorNodeIds])

  const handleToggleDeleteSelection = useCallback(() => {
    if (selectionMode !== 'delete') {
      setSelectionMode('delete')
      setSelectedAnchorNodeIds([])
      return
    }

    if (!selectedAnchorNodeIds.length) {
      setSelectionMode('none')
      return
    }

    setIsDeleteConfirmOpen(true)
  }, [selectionMode, selectedAnchorNodeIds])

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
        const res = await fetch(
          `/api/graph/${conversationId}/nodes/${encodeURIComponent(nodeId)}`,
          {
            method: 'DELETE',
          },
        )
        if (!res.ok) {
          continue
        }
      }
      await fetchGraph(conversationId)
      // Only remove draft nodes that were selected for deletion
      setDrafts((current) =>
        current.filter((d) => !selectedAnchorNodeIds.includes(d.anchorNodeId ?? d.id)),
      )
    } catch {
    }

    setIsDeleteConfirmOpen(false)
    setSelectionMode('none')
    setSelectedAnchorNodeIds([])
  }, [selectedAnchorNodeIds, conversationId, fetchGraph, graph])

  const handleCancelDelete = useCallback(() => {
    setIsDeleteConfirmOpen(false)
    setSelectionMode('none')
    setSelectedAnchorNodeIds([])
  }, [])

  const handleCreateRootDraftWithCenter = useCallback(() => {
    const newDraftId = `draft-${Math.random().toString(36).slice(2)}`
    setDrafts((current) => [
      ...current,
      { id: newDraftId, anchorNodeId: null, fromNodeIds: [] },
    ])

    setTimeout(() => {
      fitView({ duration: 300 })
    }, 50)
  }, [fitView])

  useEffect(() => {
    setChatEditingNodeId(null)
    setChatEditContent('')
    setChatEditError(null)
  }, [expandedNodeId])

  const [chatEditingNodeId, setChatEditingNodeId] = useState<string | null>(null)
  const [chatEditContent, setChatEditContent] = useState('')
  const [isChatSavingEdit, setIsChatSavingEdit] = useState(false)
  const [chatEditError, setChatEditError] = useState<string | null>(null)

  const startChatEditing = useCallback((nodeId: string, currentContent: string) => {
    setChatEditingNodeId(nodeId)
    setChatEditContent(currentContent)
    setChatEditError(null)
  }, [])

  const cancelChatEditing = useCallback(() => {
    setChatEditingNodeId(null)
    setChatEditContent('')
    setChatEditError(null)
  }, [])

  const saveChatEdit = useCallback(async () => {
    if (!chatEditingNodeId) return

    const text = chatEditContent.trim()
    if (!text) {
      cancelChatEditing()
      return
    }

    setIsChatSavingEdit(true)
    setChatEditError(null)

    try {
      await handleEditNode(chatEditingNodeId, text)
      setChatEditingNodeId(null)
    } catch (err) {
      setChatEditError(err instanceof Error ? err.message : 'Failed to save edit')
    } finally {
      setIsChatSavingEdit(false)
    }
  }, [chatEditingNodeId, chatEditContent, handleEditNode, cancelChatEditing])

  const expandedPair = expandedNodeId
    ? pairs.find((p) => p.id === expandedNodeId)
    : undefined

  const expandedDraft = expandedNodeId
    ? drafts.find((d) => d.id === expandedNodeId)
    : undefined

  const isExpanded = !!expandedPair || !!expandedDraft

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
            {expandedPair && (
              <div
                key={expandedPair.id}
                id={`expanded-pair-${expandedPair.id}`}
                className="graph-expanded-chat-item"
              >
                {chatEditingNodeId === expandedPair.id ? (
                  <div className="qa-node-edit-container">
                    <input
                      className="qa-node-input qa-node-input--chat-mode"
                      value={chatEditContent}
                      onChange={(e) => setChatEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          saveChatEdit()
                        } else if (e.key === 'Escape') {
                          cancelChatEditing()
                        }
                      }}
                      disabled={isChatSavingEdit}
                      autoFocus
                      placeholder="Edit your message..."
                    />
                    <div className="qa-node-edit-actions">
                      <button
                        className="qa-node-edit-cancel"
                        onClick={cancelChatEditing}
                        disabled={isChatSavingEdit}
                      >
                        Cancel
                      </button>
                      <button
                        className="qa-node-edit-save"
                        onClick={saveChatEdit}
                        disabled={isChatSavingEdit || !chatEditContent.trim()}
                      >
                        {isChatSavingEdit ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    {chatEditError && <div className="qa-node-error">{chatEditError}</div>}
                  </div>
                ) : (
                  <>
                    <div className="qa-bubble-row">
                      <div className="qa-bubble qa-bubble--user">{expandedPair.userNode.label}</div>
                      <button
                        className="qa-node-edit-icon"
                        onClick={() => startChatEditing(expandedPair.id, expandedPair.userNode.label)}
                        title="Edit message"
                      >
                        ✎
                      </button>
                    </div>
                    {expandedPair.aiNode && (
                      <div className="qa-bubble qa-bubble--ai">
                        <ReactMarkdown
                          components={{
                            p: ({ children }: any) => (
                              <p style={{ margin: '0.25rem 0' }}>{children}</p>
                            ),
                            strong: ({ children }: any) => (
                              <strong style={{ fontWeight: 700 }}>{children}</strong>
                            ),
                            em: ({ children }: any) => (
                              <em style={{ fontStyle: 'italic' }}>{children}</em>
                            ),
                            code: ({ children }: any) => (
                              <code
                                style={{
                                  backgroundColor: 'rgba(0, 0, 0, 0.1)',
                                  padding: '0.1rem 0.3rem',
                                  borderRadius: '0.2rem',
                                  fontFamily: 'monospace',
                                }}
                              >
                                {children}
                              </code>
                            ),
                            ul: ({ children }: any) => (
                              <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>
                                {children}
                              </ul>
                            ),
                            ol: ({ children }: any) => (
                              <ol style={{ margin: '0.25rem 0', paddingLeft: '1.25rem' }}>
                                {children}
                              </ol>
                            ),
                            li: ({ children }: any) => (
                              <li style={{ margin: '0.1rem 0' }}>{children}</li>
                            ),
                          }}
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
                    value={chatEditContent}
                    onChange={(e) => setChatEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && chatEditContent.trim()) {
                        e.preventDefault()
                        if (expandedDraft && chatEditContent.trim()) {
                          setIsChatSavingEdit(true)
                          handleSendFromDraft(expandedDraft.fromNodeIds, chatEditContent, expandedDraft.id)
                            .catch(() => setChatEditError('Failed to send'))
                            .finally(() => setIsChatSavingEdit(false))
                        }
                      }
                    }}
                    disabled={isChatSavingEdit}
                    autoFocus
                  />
                  <div className="qa-node-edit-actions">
                    <button
                      className="qa-node-send-button"
                      onClick={() => {
                        if (expandedDraft && chatEditContent.trim()) {
                          setIsChatSavingEdit(true)
                          handleSendFromDraft(expandedDraft.fromNodeIds, chatEditContent, expandedDraft.id)
                            .catch(() => setChatEditError('Failed to send'))
                            .finally(() => setIsChatSavingEdit(false))
                        }
                      }}
                      disabled={isChatSavingEdit || !chatEditContent.trim()}
                      style={{ marginTop: '0.5rem' }}
                    >
                      {isChatSavingEdit ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                  {chatEditError && <div className="qa-node-error">{chatEditError}</div>}
                </div>
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
              fitView
              onInit={onInit}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={onPaneClick}
              onNodeDragStop={onNodeDragStop}
              onNodesChange={onNodesChange}
              proOptions={{ hideAttribution: true }}
              style={{ width: '100%', height: '100%' }}
              minZoom={0.07}
              maxZoom={4}
            >
              <Background gap={16} color="#e5e7eb" />
              <Controls />
            </ReactFlow>
          </div>
          <div className="graph-toolbar">
            <button
              type="button"
              className="graph-toolbar-button"
              onClick={handleCreateRootDraftWithCenter}
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
