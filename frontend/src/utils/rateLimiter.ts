/**
 * Rate Limiter Utility
 * 
 * Tracks AI API call timestamps and enforces rate limits using a sliding window approach.
 * This limits the user's own API requests per minute.
 */

/** Stores timestamps of recent AI calls */
const callTimestamps: number[] = []

/** Time window in milliseconds (1 minute) */
const WINDOW_MS = 60 * 1000

/**
 * Remove expired timestamps outside the sliding window
 */
function cleanupExpiredTimestamps(): void {
    const now = Date.now()
    const cutoff = now - WINDOW_MS

    // Remove timestamps older than the window
    while (callTimestamps.length > 0 && callTimestamps[0] < cutoff) {
        callTimestamps.shift()
    }
}

/**
 * Check if a new AI call can be made based on the rate limit
 * @param limitPerMinute - Maximum calls allowed per minute (null = unlimited, 0 = blocked)
 * @returns Object with canProceed flag and optional wait time in seconds
 */
export function checkRateLimit(limitPerMinute: number | null): {
    canProceed: boolean
    waitSeconds?: number
    remainingCalls?: number
    blocked?: boolean
} {
    // If limit is null, no rate limiting is applied (unlimited)
    if (limitPerMinute === null) {
        return { canProceed: true }
    }

    // If limit is 0, all AI calls are blocked
    if (limitPerMinute === 0) {
        return {
            canProceed: false,
            blocked: true,
            remainingCalls: 0,
        }
    }

    cleanupExpiredTimestamps()

    const currentCount = callTimestamps.length
    const remainingCalls = limitPerMinute - currentCount

    if (currentCount >= limitPerMinute) {
        // Calculate how long until the oldest call expires
        const oldestTimestamp = callTimestamps[0]
        const now = Date.now()
        const waitMs = (oldestTimestamp + WINDOW_MS) - now
        const waitSeconds = Math.max(1, Math.ceil(waitMs / 1000))

        return {
            canProceed: false,
            waitSeconds,
            remainingCalls: 0,
        }
    }

    return {
        canProceed: true,
        remainingCalls,
    }
}

/**
 * Record a new AI call timestamp
 * Should be called after successfully initiating an AI request
 */
export function recordAICall(): void {
    cleanupExpiredTimestamps()
    callTimestamps.push(Date.now())
}

/**
 * Get the current number of calls made within the window
 */
export function getCurrentCallCount(): number {
    cleanupExpiredTimestamps()
    return callTimestamps.length
}

/**
 * Reset all recorded timestamps (useful for testing or clearing state)
 */
export function resetRateLimiter(): void {
    callTimestamps.length = 0
}
