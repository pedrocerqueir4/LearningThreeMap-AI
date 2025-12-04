/**
 * Application constants
 */

// AI Configuration
export const AI_MODEL = 'gemini-2.5-flash-lite'
export const AI_API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

// Default Messages
export const DEFAULT_CONVERSATION_TITLE = 'New Conversation'
export const DEFAULT_SYSTEM_INSTRUCTION = 'You are a helpful learning assistant. Answer concisely and clearly, focusing on the user question.'

// Limits
export const DEFAULT_MESSAGE_HISTORY_LIMIT = 20
export const MAX_TITLE_WORDS = 3

// Error Messages
export const ERROR_MESSAGES = {
    CONVERSATION_ID_REQUIRED: 'conversationId is required',
    CONTENT_REQUIRED: 'content is required',
    TITLE_REQUIRED: 'title is required',
    NODE_ID_REQUIRED: 'nodeId is required',
    CONVERSATION_NOT_FOUND: 'Conversation not found',
    NODE_NOT_FOUND: 'Node not found or not a user node',
    AI_FAILED: 'Failed to generate AI response. Please try again.',
    INVALID_PARAMS: 'conversationId, nodeId, and content are required',
} as const
