import { create } from 'zustand'
import * as api from '../services/api'
import { useSettingsStore } from './settings'
import { checkRateLimit, recordAICall } from '../utils/rateLimiter'

export type Message = {
  id: string
  conversationId: string
  author: 'user' | 'ai'
  content: string
  createdAt: string
}

type MessageState = {
  messagesByConversationId: Record<string, Message[]>
  rateLimitError: string | null
}

type MessageActions = {
  setMessagesForConversation: (conversationId: string, messages: Message[]) => void
  appendMessages: (conversationId: string, messages: Message | Message[]) => void
  sendMessage: (conversationId: string, content: string, fromNodeIds?: string[] | null, draftNodeId?: string | null, position?: { x: number; y: number } | null, contextRanges?: { sourceNodeId: string; startPos: number; endPos: number }[] | null) => Promise<void>
  clearRateLimitError: () => void
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
  rateLimitError: null,

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

    // Check rate limit before making API call
    const rateLimitPerMinute = useSettingsStore.getState().rateLimitPerMinute
    const rateLimitCheck = checkRateLimit(rateLimitPerMinute)

    if (!rateLimitCheck.canProceed) {
      const errorMessage = rateLimitCheck.blocked
        ? 'AI requests are currently disabled. Set a rate limit in Settings to enable them.'
        : `Rate limit exceeded. Please wait ${rateLimitCheck.waitSeconds} seconds before sending another message.`
      set({ rateLimitError: errorMessage })
      throw new Error(errorMessage)
    }

    // Clear any previous rate limit error
    set({ rateLimitError: null })

    // Record the AI call before making the request
    recordAICall()

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

  clearRateLimitError: () => {
    set({ rateLimitError: null })
  },
}))

