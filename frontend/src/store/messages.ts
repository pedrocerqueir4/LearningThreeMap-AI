import { create } from 'zustand'

export type Message = {
  id: string
  conversationId: string
  author: 'user' | 'ai'
  content: string
  createdAt: string
}

type MessageState = {
  messagesByConversationId: Record<string, Message[]>
}

type MessageActions = {
  setMessagesForConversation: (conversationId: string, messages: Message[]) => void
  appendMessages: (conversationId: string, messages: Message | Message[]) => void
  sendMessage: (conversationId: string, content: string, fromNodeIds?: string[] | null) => Promise<void>
}

export const useMessageStore = create<MessageState & MessageActions>((set, get) => ({
  messagesByConversationId: {},
  setMessagesForConversation: (conversationId, messages) => {
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: messages,
      },
    }))
  },
  appendMessages: (conversationId, messages) => {
    const toAppend = Array.isArray(messages) ? messages : [messages]
    const current = get().messagesByConversationId[conversationId] ?? []
    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: [...current, ...toAppend],
      },
    }))
  },
  sendMessage: async (conversationId, content, fromNodeIds) => {
    const trimmed = content.trim()
    if (!trimmed) return

    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, content: trimmed, fromNodeIds: fromNodeIds ?? [] }),
    })

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as
        | { error?: string }
        | null
      const msg = errorBody?.error ?? 'Failed to send message'
      throw new Error(msg)
    }

    const data = (await response.json()) as {
      userMessage: {
        id: string
        conversation_id: string
        author: 'user' | 'ai'
        content: string
        created_at: string
      }
      aiMessage: {
        id: string
        conversation_id: string
        author: 'user' | 'ai'
        content: string
        created_at: string
      }
    }

    const toClient = (m: {
      id: string
      conversation_id: string
      author: 'user' | 'ai'
      content: string
      created_at: string
    }): Message => ({
      id: m.id,
      conversationId: m.conversation_id,
      author: m.author,
      content: m.content,
      createdAt: m.created_at,
    })

    const userMsg = toClient(data.userMessage)
    const aiMsg = toClient(data.aiMessage)
    const current = get().messagesByConversationId[conversationId] ?? []

    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: [...current, userMsg, aiMsg],
      },
    }))
  },
}))
