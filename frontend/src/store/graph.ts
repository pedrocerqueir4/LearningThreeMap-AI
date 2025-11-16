import { create } from 'zustand'

export type GraphNode = {
  id: string
  conversation_id: string
  message_id: string | null
  type: 'user' | 'ai'
  label: string
  created_at: string
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
      const res = await fetch(`/api/graph/${conversationId}`)
      if (!res.ok) throw new Error('Failed to load graph')
      const data = (await res.json()) as { nodes: GraphNode[]; edges: GraphEdge[] }
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
}))
