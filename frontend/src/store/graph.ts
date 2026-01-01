import { create } from 'zustand'
import * as api from '../services/api'
import type { ContextRange } from '../types'

export type GraphNode = {
  id: string
  conversation_id: string
  message_id: string | null
  type: 'user' | 'ai'
  label: string
  created_at: string
  pos_x: number | null
  pos_y: number | null
  context_ranges: ContextRange[] | null
  // Flag for optimistic UI - temporary node before backend confirmation
  isOptimistic?: boolean
  // Error message when backend call fails
  errorMessage?: string | null
}

export type GraphEdge = {
  id: string
  conversation_id: string
  source: string
  target: string
  created_at: string
}

type GraphState = {
  graphByConversationId: Record<string, { nodes: GraphNode[]; edges: GraphEdge[] }>
  loadingByConversationId: Record<string, boolean>
  errorByConversationId: Record<string, string | null>
}

type GraphActions = {
  setGraph: (conversationId: string, nodes: GraphNode[], edges: GraphEdge[]) => void
  setGraphLoading: (conversationId: string, loading: boolean) => void
  setGraphError: (conversationId: string, error: string | null) => void
  fetchGraph: (conversationId: string) => Promise<void>
  removeConversationGraph: (conversationId: string) => void
  updateNodePositions: (
    conversationId: string,
    positions: { nodeId: string; x: number; y: number }[],
  ) => Promise<void>
  // Optimistic UI: add nodes immediately before backend responds
  addOptimisticNodes: (
    conversationId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
  ) => void
  // Remove optimistic node (if needed for error rollback)
  removeOptimisticNode: (conversationId: string, nodeId: string) => void
  // Set error message on a specific node
  setNodeError: (conversationId: string, nodeId: string, errorMessage: string | null) => void
  // Update AI text on a node (for streaming) - uses userNodeId to find/create AI node
  updateStreamingAiText: (conversationId: string, userNodeId: string, aiText: string) => void
  // Finalize streaming: replace optimistic nodes with real backend data
  finalizeStreamingNode: (conversationId: string, userNodeId: string, aiNode: GraphNode, edge: GraphEdge) => void
}

export const useGraphStore = create<GraphState & GraphActions>((set) => ({
  graphByConversationId: {},
  loadingByConversationId: {},
  errorByConversationId: {},
  setGraph: (conversationId, nodes, edges) => {
    set((state) => ({
      graphByConversationId: {
        ...state.graphByConversationId,
        [conversationId]: { nodes, edges },
      },
    }))
  },
  setGraphLoading: (conversationId, loading) => {
    set((state) => ({
      loadingByConversationId: {
        ...state.loadingByConversationId,
        [conversationId]: loading,
      },
    }))
  },
  setGraphError: (conversationId, error) => {
    set((state) => ({
      errorByConversationId: {
        ...state.errorByConversationId,
        [conversationId]: error,
      },
    }))
  },
  fetchGraph: async (conversationId: string) => {
    set((state) => ({
      loadingByConversationId: { ...state.loadingByConversationId, [conversationId]: true },
      errorByConversationId: { ...state.errorByConversationId, [conversationId]: null },
    }))
    try {
      const data = await fetch(`/api/graph/${conversationId}`).then(res => {
        if (!res.ok) throw new Error('Failed to load graph')
        return res.json() as Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>
      })
      set((state) => ({
        graphByConversationId: {
          ...state.graphByConversationId,
          [conversationId]: { nodes: data.nodes, edges: data.edges },
        },
        loadingByConversationId: { ...state.loadingByConversationId, [conversationId]: false },
      }))
    } catch (err) {
      set((state) => ({
        loadingByConversationId: { ...state.loadingByConversationId, [conversationId]: false },
        errorByConversationId: {
          ...state.errorByConversationId,
          [conversationId]: err instanceof Error ? err.message : 'Unknown error',
        },
      }))
    }
  },
  removeConversationGraph: (conversationId: string) => {
    set((state) => {
      const { [conversationId]: _graph, ...graphByConversationId } = state.graphByConversationId
      const { [conversationId]: _loading, ...loadingByConversationId } = state.loadingByConversationId
      const { [conversationId]: _error, ...errorByConversationId } = state.errorByConversationId
      return { graphByConversationId, loadingByConversationId, errorByConversationId }
    })
  },
  updateNodePositions: async (
    conversationId: string,
    positions: { nodeId: string; x: number; y: number }[],
  ) => {
    if (!positions.length) return
    // Optimistically update local cache so that reopening the conversation
    // reuses the latest positions even if we don't refetch the graph.
    set((state) => {
      const existing = state.graphByConversationId[conversationId]
      if (!existing) return {}

      const updatedNodes = existing.nodes.map((node) => {
        const match = positions.find((p) => p.nodeId === node.id)
        if (!match) return node
        return { ...node, pos_x: match.x, pos_y: match.y }
      })

      return {
        graphByConversationId: {
          ...state.graphByConversationId,
          [conversationId]: { nodes: updatedNodes, edges: existing.edges },
        },
      }
    })
    await api.updateNodePositions(conversationId, positions)
  },
  addOptimisticNodes: (
    conversationId: string,
    nodes: GraphNode[],
    edges: GraphEdge[],
  ) => {
    set((state) => {
      const existing = state.graphByConversationId[conversationId] ?? { nodes: [], edges: [] }
      return {
        graphByConversationId: {
          ...state.graphByConversationId,
          [conversationId]: {
            nodes: [...existing.nodes, ...nodes],
            edges: [...existing.edges, ...edges],
          },
        },
      }
    })
  },
  removeOptimisticNode: (conversationId: string, nodeId: string) => {
    set((state) => {
      const existing = state.graphByConversationId[conversationId]
      if (!existing) return {}
      return {
        graphByConversationId: {
          ...state.graphByConversationId,
          [conversationId]: {
            nodes: existing.nodes.filter((n) => n.id !== nodeId),
            edges: existing.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          },
        },
      }
    })
  },
  setNodeError: (conversationId: string, nodeId: string, errorMessage: string | null) => {
    set((state) => {
      const existing = state.graphByConversationId[conversationId]
      if (!existing) return {}
      return {
        graphByConversationId: {
          ...state.graphByConversationId,
          [conversationId]: {
            ...existing,
            nodes: existing.nodes.map((n) =>
              n.id === nodeId ? { ...n, errorMessage } : n
            ),
          },
        },
      }
    })
  },
  updateStreamingAiText: (conversationId: string, userNodeId: string, aiText: string) => {
    set((state) => {
      const existing = state.graphByConversationId[conversationId]
      if (!existing) return {}

      // Find the user node to get its position
      const userNode = existing.nodes.find((n) => n.id === userNodeId)
      if (!userNode) return {}

      // Check if streaming AI node already exists
      const streamingAiNodeId = `streaming-ai-${userNodeId}`
      const existingAiNode = existing.nodes.find((n) => n.id === streamingAiNodeId)

      if (existingAiNode) {
        // Update existing streaming AI node
        return {
          graphByConversationId: {
            ...state.graphByConversationId,
            [conversationId]: {
              ...existing,
              nodes: existing.nodes.map((n) =>
                n.id === streamingAiNodeId ? { ...n, label: aiText } : n
              ),
            },
          },
        }
      } else {
        // Create new streaming AI node
        const streamingAiNode: GraphNode = {
          id: streamingAiNodeId,
          conversation_id: conversationId,
          message_id: null,
          type: 'ai',
          label: aiText,
          created_at: new Date().toISOString(),
          pos_x: userNode.pos_x,
          pos_y: userNode.pos_y,
          context_ranges: null,
          isOptimistic: true,
        }

        // Also clear the loading state from the user node
        const updatedNodes = existing.nodes.map((n) =>
          n.id === userNodeId ? { ...n, isOptimistic: false } : n
        )

        // Create edge from user to streaming AI
        const streamingEdge: GraphEdge = {
          id: `streaming-edge-${userNodeId}`,
          conversation_id: conversationId,
          source: userNodeId,
          target: streamingAiNodeId,
          created_at: new Date().toISOString(),
        }

        return {
          graphByConversationId: {
            ...state.graphByConversationId,
            [conversationId]: {
              nodes: [...updatedNodes, streamingAiNode],
              edges: [...existing.edges, streamingEdge],
            },
          },
        }
      }
    })
  },
  finalizeStreamingNode: (conversationId: string, userNodeId: string, aiNode: GraphNode, edge: GraphEdge) => {
    set((state) => {
      const existing = state.graphByConversationId[conversationId]
      if (!existing) return {}

      const streamingAiNodeId = `streaming-ai-${userNodeId}`
      const streamingEdgeId = `streaming-edge-${userNodeId}`

      // Remove streaming nodes/edges and add real ones
      const filteredNodes = existing.nodes.filter(
        (n) => n.id !== streamingAiNodeId
      )
      const filteredEdges = existing.edges.filter(
        (e) => e.id !== streamingEdgeId
      )

      // Also clear optimistic flag from user node
      const updatedNodes = filteredNodes.map((n) =>
        n.id === userNodeId ? { ...n, isOptimistic: false } : n
      )

      return {
        graphByConversationId: {
          ...state.graphByConversationId,
          [conversationId]: {
            nodes: [...updatedNodes, aiNode],
            edges: [...filteredEdges, edge],
          },
        },
      }
    })
  },
}))
