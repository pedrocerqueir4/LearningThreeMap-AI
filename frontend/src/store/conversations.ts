import { create } from 'zustand'

export type Conversation = {
  id: string
  title: string
  created_at: string
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
      const { conversations } = get()
      set({
        conversations: [created, ...conversations],
        currentConversationId: created.id,
        loading: false,
      })
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  },
}))
