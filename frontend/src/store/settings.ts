import { create } from 'zustand'

type SettingsState = {
    /** Maximum number of AI requests allowed per minute. null means unlimited, 0 means blocked. */
    rateLimitPerMinute: number | null
    /** Whether to use streaming AI responses (real-time) or wait for complete response */
    streamingEnabled: boolean
}

type SettingsActions = {
    setRateLimitPerMinute: (limit: number | null) => void
    setStreamingEnabled: (enabled: boolean) => void
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set) => {
    // For now, we don't persist this setting (future implementation with users)
    // But we still allow localStorage for demo purposes
    const savedRateLimit = typeof localStorage !== 'undefined'
        ? localStorage.getItem('ai-rate-limit')
        : null
    const savedStreaming = typeof localStorage !== 'undefined'
        ? localStorage.getItem('ai-streaming')
        : null

    // null or empty string means unlimited
    const initialRateLimit = savedRateLimit === null || savedRateLimit === ''
        ? null
        : parseInt(savedRateLimit, 10)

    // Default to streaming enabled
    const initialStreaming = savedStreaming === null ? true : savedStreaming === 'true'

    return {
        rateLimitPerMinute: isNaN(initialRateLimit as number) ? null : initialRateLimit,
        streamingEnabled: initialStreaming,

        setRateLimitPerMinute: (limit: number | null) => {
            const validLimit = limit === null ? null : Math.max(0, Math.floor(limit))
            set({ rateLimitPerMinute: validLimit })

            // Store in localStorage for demo purposes (will be replaced with user settings later)
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('ai-rate-limit', validLimit === null ? '' : String(validLimit))
            }
        },

        setStreamingEnabled: (enabled: boolean) => {
            set({ streamingEnabled: enabled })
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem('ai-streaming', String(enabled))
            }
        },
    }
})
