import { create } from 'zustand'
import { useGraphStore } from './graph'

export type Conversation = {
  id: string
  title: string
  created_at: string
  isDraft?: boolean
  system_instruction?: string
}

type ConversationState = {
  conversations: Conversation[]
  currentConversationId: string | null
  loading: boolean
  error: string | null
}

type ConversationActions = {
  setCurrentConversation: (id: string | null) => void
  fetchConversations: () => Promise<void>
  createConversation: (title?: string) => Promise<void>
  touchConversation: (id: string) => void
  deleteConversation: (conversationId: string) => Promise<void>
  updateConversationTitle: (conversationId: string, title: string) => Promise<void>
  updateConversationSystemInstruction: (conversationId: string, instruction: string) => Promise<void>
}

export const useConversationStore = create<ConversationState & ConversationActions>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  loading: false,
  error: null,
  setCurrentConversation: (id) => set({ currentConversationId: id }),
  fetchConversations: async () => {
    set({ loading: true, error: null })
    try {
      const res = await fetch('/api/conversations')
      if (!res.ok) throw new Error('Failed to load conversations')
      const data = (await res.json()) as Conversation[]
      set((state) => ({
        conversations: data,
        loading: false,
        currentConversationId: state.currentConversationId ?? (data[0]?.id ?? null),
      }))
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  },
  createConversation: async (title) => {
    set({ loading: true, error: null })
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title ?? 'New conversation' }),
      })
      if (!res.ok) throw new Error('Failed to create conversation')
      const created = (await res.json()) as Conversation

      set((state) => ({
        conversations: [created, ...state.conversations],
        currentConversationId: created.id,
        loading: false,
        error: null,
      }))
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  },
  touchConversation: (id: string) => {
    const now = new Date().toISOString()
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id
          ? {
            ...c,
            created_at: now,
          }
          : c,
      ),
    }))
  },
  deleteConversation: async (conversationId: string) => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete conversation')

      const { removeConversationGraph } = useGraphStore.getState()
      removeConversationGraph(conversationId)

      set((state) => {
        const nextConversations = state.conversations.filter((c) => c.id !== conversationId)
        const currentConversationId =
          state.currentConversationId === conversationId ? nextConversations[0]?.id ?? null : state.currentConversationId
        return {
          conversations: nextConversations,
          currentConversationId,
          loading: false,
        }
      })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  },
  updateConversationTitle: async (conversationId: string, title: string) => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) throw new Error('Failed to update conversation title')
      const updated = (await res.json()) as Conversation

      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === conversationId ? updated : c)),
        loading: false,
      }))
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  },
  updateConversationSystemInstruction: async (conversationId: string, instruction: string) => {
    set({ loading: true, error: null })
    try {
      const res = await fetch(`/api/conversations/${conversationId}/agent`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemInstruction: instruction }),
      })
      if (!res.ok) throw new Error('Failed to update conversation agent')
      const updated = (await res.json()) as Conversation

      set((state) => ({
        conversations: state.conversations.map((c) => (c.id === conversationId ? updated : c)),
        loading: false,
      }))
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  },
}))
