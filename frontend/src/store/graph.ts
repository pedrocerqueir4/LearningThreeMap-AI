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
}))
