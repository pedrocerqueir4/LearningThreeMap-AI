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

import type { GraphEdge, GraphNode } from '../store/graph'
import { useGraphStore } from '../store/graph'

export type ConversationGraphProps = {
  graph: { nodes: GraphNode[]; edges: GraphEdge[] } | null
  conversationId: string
  onSendFromNode: (fromNodeId: string | null, content: string) => Promise<void>
}

type QaNodeData = {
  id: string
  mode: 'draft' | 'complete'
  userText: string | null
  aiText: string | null
  anchorNodeId: string | null
  onSend: (fromNodeId: string | null, content: string, draftId: string) => Promise<void>
  onCreateDraftBelow: (nodeId: string, anchorNodeId: string | null) => void
  isZoomed: boolean
}

const QaNode = ({ data }: NodeProps<QaNodeData>) => {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDraft = data.mode === 'draft'

  const handleSend = async () => {
    const text = draft.trim()
    if (!isDraft || !text || sending) return
    setSending(true)
    setError(null)
    try {
      await data.onSend(data.anchorNodeId ?? null, text, data.id)
      setDraft('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
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
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
            />
            <button
              className="qa-node-send-button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              type="button"
            >
              <span className="qa-node-send-plus">+</span> Send
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="qa-node-body">
            {data.userText && <div className="qa-bubble qa-bubble--user">{data.userText}</div>}
            {data.aiText && <div className="qa-bubble qa-bubble--ai">{data.aiText}</div>}
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
}

function InnerConversationGraph({ graph, conversationId, onSendFromNode }: ConversationGraphProps) {
  const { setCenter, fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<QaNodeData>([])
  const [zoomedNodeId, setZoomedNodeId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<DraftNode[]>([])
  const { updateNodePositions } = useGraphStore()

  // Reset drafts when conversation changes
  useEffect(() => {
    setDrafts([])
  }, [conversationId])

  const handleCreateDraftBelow = useCallback((nodeId: string, anchorNodeId: string | null) => {
    setDrafts((current) => [
      ...current,
      { id: `draft-${Math.random().toString(36).slice(2)}`, anchorNodeId: anchorNodeId ?? nodeId },
    ])
  }, [])

  const handleCreateRootDraft = useCallback(() => {
    setDrafts((current) => [
      ...current,
      { id: `draft-${Math.random().toString(36).slice(2)}`, anchorNodeId: null },
    ])
  }, [])

  const handleSendFromDraft = useCallback(
    async (fromNodeId: string | null, content: string, draftId: string) => {
      await onSendFromNode(fromNodeId, content)
      setDrafts((current) => current.filter((d) => d.id !== draftId))
    },
    [onSendFromNode],
  )

  const { computedNodes, edges } = useMemo(() => {
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

    // Build mapping from graph node id -> pair id (for edges between pairs)
    const pairIdByAnchorNodeId = new Map<string, string>()
    for (const p of pairs) {
      pairIdByAnchorNodeId.set(p.anchorNodeId, p.id)
    }

    // Position nodes based on saved positions when available; otherwise fall back to a simple layout.
    const reactFlowNodes: Node<QaNodeData>[] = pairs.map((p, index) => {
      const fallbackPosition = { x: 0, y: index * 220 }
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
          onSend: handleSendFromDraft,
          onCreateDraftBelow: handleCreateDraftBelow,
          isZoomed: zoomedNodeId === p.id,
        },
      }
    })

    // Track occupied positions so we can place new draft nodes near their parent
    // without heavily overlapping existing nodes.
    const occupiedPositions: { x: number; y: number }[] = reactFlowNodes.map((n) => n.position)

    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y)

    const MIN_DISTANCE = 180
    const OFFSETS: { x: number; y: number }[] = [
      { x: 0, y: 220 },
      { x: 260, y: 0 },
      { x: -260, y: 0 },
      { x: 260, y: 220 },
      { x: -260, y: 220 },
      { x: 0, y: -220 },
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

      // Fallback: push slightly further down from the base to avoid a perfect overlap.
      const candidate = { x: base.x, y: base.y + 240 }
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
          onSend: handleSendFromDraft,
          onCreateDraftBelow: handleCreateDraftBelow,
          isZoomed: zoomedNodeId === draft.id,
        },
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
      if (!draft.anchorNodeId) continue
      const sourcePairId = pairIdByAnchorNodeId.get(draft.anchorNodeId)
      if (!sourcePairId) continue

      reactFlowEdges.push({
        id: `draft-edge-${draft.id}`,
        source: sourcePairId,
        target: draft.id,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#111827' },
        style: { stroke: '#111827', strokeWidth: 2 },
        animated: false,
      })
    }

    return { computedNodes: reactFlowNodes, edges: reactFlowEdges }
  }, [
    graph,
    zoomedNodeId,
    conversationId,
    drafts,
    handleSendFromDraft,
    handleCreateDraftBelow,
  ])

  useEffect(() => {
    setNodes((prevNodes) => {
      return computedNodes.map((node) => {
        const existing = prevNodes.find((prev) => prev.id === node.id)
        return existing ? { ...node, position: existing.position } : node
      })
    })
  }, [computedNodes, setNodes])

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node<QaNodeData>) => {
      setZoomedNodeId(node.id)
      setCenter(node.position.x + 150, node.position.y + 80, { zoom: 1.4, duration: 200 })
    },
    [setCenter],
  )

  const onPaneClick = useCallback(() => {
    setZoomedNodeId(null)
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

  return (
    <div className="graph-shell">
      <div className="graph-flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          onInit={onInit}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          onNodesChange={onNodesChange}
          proOptions={{ hideAttribution: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <Background gap={16} color="#e5e7eb" />
          <Controls />
        </ReactFlow>
      </div>
      <div className="graph-toolbar">
        <button
          type="button"
          className="graph-toolbar-button"
          onClick={handleCreateRootDraft}
        >
          <span className="graph-toolbar-button-icon">+</span>
          <span className="graph-toolbar-button-label">New starting node</span>
        </button>
      </div>
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
