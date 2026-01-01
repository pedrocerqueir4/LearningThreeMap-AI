/**
 * AI service for handling Gemini API calls
 */

import { getConversationById } from './db'
import { AI_MODEL, AI_API_BASE_URL, DEFAULT_SYSTEM_INSTRUCTION, MAX_TITLE_WORDS } from './constants'

export type GeminiContent = {
    role: 'user' | 'model'
    parts: { text: string }[]
}

/**
 * Get system instruction for a conversation
 */
export async function getSystemInstruction(
    db: D1Database,
    conversationId: string
): Promise<string> {
    try {
        const conversation = await getConversationById(db, conversationId)
        if (conversation?.system_instruction) {
            return conversation.system_instruction
        }
    } catch (err) {
        console.error('Failed to fetch conversation system instruction:', err)
    }
    return DEFAULT_SYSTEM_INSTRUCTION
}

/**
 * Build Gemini contents from message history
 */
export function buildGeminiContents(
    history: { author: 'user' | 'ai'; content: string }[],
    includeCurrentMessage?: string
): GeminiContent[] {
    const contents = history.map((m) => ({
        role: m.author === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
    })) as GeminiContent[]

    if (includeCurrentMessage) {
        contents.push({
            role: 'user',
            parts: [{ text: includeCurrentMessage }],
        })
    }

    return contents
}

/**
 * Call Gemini API once
 */
async function callGeminiAPI(
    apiKey: string,
    systemInstruction: string,
    contents: GeminiContent[]
): Promise<string> {
    const url = `${AI_API_BASE_URL}/${AI_MODEL}:generateContent?key=${apiKey}`

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
        }),
    })

    if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        const msg = errBody?.error?.message ?? `AI request failed with status ${response.status}`
        throw new Error(msg)
    }

    const data = (await response.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
    }

    const aiText = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim()

    if (!aiText) {
        throw new Error('AI returned an empty response')
    }

    return aiText
}

/**
 * Call Gemini API with retry logic (2 attempts)
 */
export async function generateAIResponse(
    apiKey: string,
    systemInstruction: string,
    contents: GeminiContent[]
): Promise<string> {
    try {
        return await callGeminiAPI(apiKey, systemInstruction, contents)
    } catch (firstError) {
        console.error('AI call failed (first attempt):', firstError)
        try {
            return await callGeminiAPI(apiKey, systemInstruction, contents)
        } catch (secondError) {
            console.error('AI call failed (second attempt):', secondError)
            throw new Error('Failed to generate AI response. Please try again.')
        }
    }
}

/**
 * Generate AI response with streaming (returns an async generator)
 */
export async function* generateAIResponseStream(
    apiKey: string,
    systemInstruction: string,
    contents: GeminiContent[]
): AsyncGenerator<string, void, unknown> {
    // Use streamGenerateContent endpoint for streaming
    const url = `${AI_API_BASE_URL}/${AI_MODEL}:streamGenerateContent?key=${apiKey}&alt=sse`

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemInstruction }] },
            contents,
        }),
    })

    if (!response.ok) {
        const errBody = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
        const msg = errBody?.error?.message ?? `AI request failed with status ${response.status}`
        throw new Error(msg)
    }

    if (!response.body) {
        throw new Error('Response body is null')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Parse SSE events from buffer
            const lines = buffer.split('\n')
            buffer = lines.pop() || '' // Keep incomplete line in buffer

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.slice(6)
                    if (jsonStr.trim() === '[DONE]') continue

                    try {
                        const data = JSON.parse(jsonStr) as {
                            candidates?: { content?: { parts?: { text?: string }[] } }[]
                        }
                        const text = data.candidates?.[0]?.content?.parts?.[0]?.text
                        if (text) {
                            yield text
                        }
                    } catch (e) {
                        // Skip malformed JSON
                        console.warn('Failed to parse SSE data:', e)
                    }
                }
            }
        }

        // Process any remaining buffer
        if (buffer.startsWith('data: ')) {
            const jsonStr = buffer.slice(6)
            if (jsonStr.trim() !== '[DONE]') {
                try {
                    const data = JSON.parse(jsonStr) as {
                        candidates?: { content?: { parts?: { text?: string }[] } }[]
                    }
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text
                    if (text) {
                        yield text
                    }
                } catch {
                    // Skip
                }
            }
        }
    } finally {
        reader.releaseLock()
    }
}

/**
 * Generate a short conversation title based on first exchange
 */
export async function generateConversationTitle(
    apiKey: string,
    userQuestion: string,
    aiAnswer: string
): Promise<string> {
    const titlePrompt =
        `Generate a short, clear title (1 to ${MAX_TITLE_WORDS} words) for this learning conversation. ` +
        'Return only the title text without quotes.\\n\\n' +
        `User question:\\n${userQuestion}\\n\\n` +
        `AI answer:\\n${aiAnswer}`

    try {
        const url = `${AI_API_BASE_URL}/${AI_MODEL}:generateContent?key=${apiKey}`

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: titlePrompt }] }],
            }),
        })

        if (!response.ok) {
            return 'New conversation'
        }

        const data = (await response.json()) as {
            candidates?: { content?: { parts?: { text?: string }[] } }[]
        }

        let generatedTitle =
            data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? ''

        if (generatedTitle) {
            generatedTitle = generatedTitle.replace(/\\s+/g, ' ')
            const words = generatedTitle.split(' ').filter(Boolean).slice(0, MAX_TITLE_WORDS)
            return words.join(' ')
        }

        return 'New conversation'
    } catch (err) {
        console.error('Failed to generate title:', err)
        return 'New conversation'
    }
}
