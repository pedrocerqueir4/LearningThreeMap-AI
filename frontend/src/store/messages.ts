import { create } from 'zustand'
import * as api from '../services/api'

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
  sendMessage: (conversationId: string, content: string, fromNodeIds?: string[] | null, draftNodeId?: string | null, position?: { x: number; y: number } | null, contextRanges?: { sourceNodeId: string; startPos: number; endPos: number }[] | null) => Promise<void>
}

/**
 * Transform server message format to client format
 */
function toClientMessage(m: {
  id: string
  conversation_id: string
  author: 'user' | 'ai'
  content: string
  created_at: string
}): Message {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    author: m.author,
    content: m.content,
    createdAt: m.created_at,
  }
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
  sendMessage: async (conversationId, content, fromNodeIds, draftNodeId, position, contextRanges) => {
    const trimmed = content.trim()
    if (!trimmed) return

    const data = await api.sendMessage(conversationId, trimmed, fromNodeIds, draftNodeId, position, contextRanges)

    const userMsg = toClientMessage(data.userMessage)
    const aiMsg = toClientMessage(data.aiMessage)
    const current = get().messagesByConversationId[conversationId] ?? []

    set((state) => ({
      messagesByConversationId: {
        ...state.messagesByConversationId,
        [conversationId]: [...current, userMsg, aiMsg],
      },
    }))
  },
}))
