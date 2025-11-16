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
}))
