import { useCallback, useEffect, useRef } from 'react'
import type React from 'react'
import ReactMarkdown from 'react-markdown'
import {
    markdownComponents,
    remarkPlugins,
    rehypePlugins,
} from '../../utils/markdown'
import type { DraftNode, ContextRange } from '../../types'
import type { Pair, ChatEditState } from './types'

type ExpandedChatProps = {
    expandedPair?: Pair
    expandedDraft?: DraftNode
    parentPairs: Pair[]
    childPairs: Pair[]
    chatEdit: ChatEditState
    onClose: () => void
    onNavigate: (id: string) => void
    onSendDraft: (
        fromNodeIds: string[] | null,
        content: string,
        draftId: string
    ) => Promise<void>
    onSaveEdit: (nodeId: string, content: string) => Promise<void>
    highlightText?: string | null
    onNavigateWithHighlight?: (nodeId: string, highlightText?: string) => void
}

export function ExpandedChat({
    expandedPair,
    expandedDraft,
    parentPairs,
    childPairs,
    chatEdit,
    onClose,
    onNavigate,
    onSendDraft,
    onSaveEdit,
    highlightText,
    onNavigateWithHighlight,
}: ExpandedChatProps) {
    // Ref for the AI bubble to apply DOM-based highlighting
    const aiBubbleRef = useRef<HTMLDivElement>(null)

    /**
     * Render user text with context ranges highlighted as clickable spans.
     */
    const renderUserText = (text: string, ranges?: ContextRange[] | null) => {
        // If no context ranges, return plain text
        if (!ranges || ranges.length === 0) {
            return text
        }

        // Sort ranges by startPos to process in order
        const sortedRanges = [...ranges].sort((a, b) => a.startPos - b.startPos)

        const elements: React.ReactNode[] = []
        let lastEnd = 0

        sortedRanges.forEach((range, index) => {
            // Add text before this range
            if (range.startPos > lastEnd) {
                elements.push(text.slice(lastEnd, range.startPos))
            }

            // Add the context span
            const contextText = text.slice(range.startPos, range.endPos)
            const display = contextText.length > 20 ? contextText.substring(0, 20) + '...' : contextText
            const isClickable = !!onNavigateWithHighlight
            elements.push(
                <span
                    key={`context-${index}`}
                    className={`qa-context-block qa-context-block--permanent${isClickable ? ' clickable' : ''}`}
                    title={isClickable ? `Click to navigate to source` : contextText}
                    onClick={isClickable ? (e) => {
                        e.stopPropagation()
                        // Navigate to source node and highlight the context text
                        onNavigateWithHighlight?.(range.sourceNodeId, contextText)
                    } : undefined}
                    style={isClickable ? { cursor: 'pointer' } : undefined}
                >
                    "{display}"
                </span>
            )

            lastEnd = range.endPos
        })

        // Add remaining text after last range
        if (lastEnd < text.length) {
            elements.push(text.slice(lastEnd))
        }

        return elements
    }
    // Handle Escape key to close
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                onClose()
            }
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [onClose])

    // Scroll to top when expanded content changes
    useEffect(() => {
        const body = document.querySelector('.graph-expanded-chat-body')
        if (body instanceof HTMLElement) {
            body.scrollTop = 0
        }
    }, [expandedPair?.id, expandedDraft?.id])

    // Reset edit state when expanding/collapsing (this acts as the mount/update effect)
    useEffect(() => {
        chatEdit.setEditContent('')
        chatEdit.setError(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expandedPair?.id, expandedDraft?.id])

    const handleSaveChatEdit = useCallback(async () => {
        if (!expandedPair) return
        await chatEdit.saveEdit(
            async (content) => await onSaveEdit(expandedPair.id, content),
            expandedPair.userNode.label
        )
    }, [expandedPair, chatEdit, onSaveEdit])

    // Effect to highlight text in the AI bubble when highlightText changes
    useEffect(() => {
        if (!highlightText || !aiBubbleRef.current) return

        const highlightTextValue = highlightText
        const container = aiBubbleRef.current

        // Collect all text nodes with their positions in the combined text
        const textNodes: { node: Text; start: number; end: number }[] = []
        let totalLength = 0

        const collectTextNodes = (node: Node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                const text = node.textContent || ''
                if (text.length > 0) {
                    textNodes.push({
                        node: node as Text,
                        start: totalLength,
                        end: totalLength + text.length,
                    })
                    totalLength += text.length
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                for (let i = 0; i < node.childNodes.length; i++) {
                    collectTextNodes(node.childNodes[i])
                }
            }
        }
        collectTextNodes(container)

        // Combine all text content
        const combinedText = textNodes.map(tn => tn.node.textContent || '').join('')

        // Normalize whitespace helper
        const normalizeWhitespace = (text: string) => text.replace(/\s+/g, ' ').trim()

        // Try exact match first
        let matchStart = combinedText.indexOf(highlightTextValue)
        let effectiveHighlightText = highlightTextValue

        // If no exact match, try normalized whitespace match
        if (matchStart < 0) {
            const normalizedSearch = normalizeWhitespace(highlightTextValue)
            const normalizedCombined = normalizeWhitespace(combinedText)
            const normalizedMatchStart = normalizedCombined.indexOf(normalizedSearch)

            if (normalizedMatchStart >= 0) {
                // Find the approximate position in the original text
                let nonWsCount = 0
                let targetNonWsCount = 0
                for (let i = 0; i < normalizedMatchStart; i++) {
                    if (!/\s/.test(normalizedCombined[i])) targetNonWsCount++
                }

                // Find position in original where we have same non-whitespace count
                for (let i = 0; i < combinedText.length; i++) {
                    if (!/\s/.test(combinedText[i])) nonWsCount++
                    if (nonWsCount > targetNonWsCount) {
                        matchStart = i
                        break
                    }
                }

                // Find end position similarly
                let endNonWsCount = targetNonWsCount
                for (let i = 0; i < normalizedSearch.length; i++) {
                    if (!/\s/.test(normalizedSearch[i])) endNonWsCount++
                }

                nonWsCount = 0
                let matchEnd = combinedText.length
                for (let i = 0; i < combinedText.length; i++) {
                    if (!/\s/.test(combinedText[i])) nonWsCount++
                    if (nonWsCount >= endNonWsCount) {
                        matchEnd = i + 1
                        break
                    }
                }

                effectiveHighlightText = combinedText.slice(matchStart, matchEnd)
            } else {
                return // Text not found even with normalization
            }
        }

        if (matchStart < 0) return // Text not found

        const matchEnd = matchStart + effectiveHighlightText.length

        // Find which text nodes overlap with the match
        const nodesToHighlight: { node: Text; localStart: number; localEnd: number }[] = []
        for (const tn of textNodes) {
            if (tn.end <= matchStart || tn.start >= matchEnd) continue // No overlap
            const localStart = Math.max(0, matchStart - tn.start)
            const localEnd = Math.min(tn.node.textContent?.length || 0, matchEnd - tn.start)
            nodesToHighlight.push({ node: tn.node, localStart, localEnd })
        }

        // Wrap the matched portions in each overlapping text node
        for (let i = nodesToHighlight.length - 1; i >= 0; i--) {
            const { node, localStart, localEnd } = nodesToHighlight[i]
            const text = node.textContent || ''
            const parent = node.parentNode
            if (!parent) continue

            const before = text.slice(0, localStart)
            const match = text.slice(localStart, localEnd)
            const after = text.slice(localEnd)

            const span = document.createElement('span')
            span.className = 'qa-context-block--highlight'
            span.textContent = match

            const fragment = document.createDocumentFragment()
            if (before) fragment.appendChild(document.createTextNode(before))
            fragment.appendChild(span)
            if (after) fragment.appendChild(document.createTextNode(after))

            parent.replaceChild(fragment, node)
        }

        // Cleanup: remove highlight spans after animation (5s to match timeout)
        return () => {
            const highlightSpans = container.querySelectorAll('.qa-context-block--highlight')
            highlightSpans.forEach(span => {
                const parent = span.parentNode
                if (parent) {
                    const text = document.createTextNode(span.textContent || '')
                    parent.replaceChild(text, span)
                    parent.normalize()
                }
            })
        }
    }, [highlightText])

    return (
        <div className="graph-expanded-chat">
            <div className="graph-expanded-chat-header">
                <button
                    type="button"
                    className="graph-expanded-close-button"
                    onClick={onClose}
                >
                    Close chat
                </button>
            </div>
            <div className="graph-expanded-chat-body">
                {/* Navigation dots for parent nodes (above) */}
                {parentPairs.length > 0 && (
                    <div className="graph-nav-dots-container graph-nav-dots-container--top">
                        {parentPairs.map((pair) => (
                            <button
                                key={pair.id}
                                type="button"
                                className="graph-nav-dot"
                                onClick={() => onNavigate(pair.id)}
                                title={
                                    pair.userNode.label.length > 50
                                        ? pair.userNode.label.substring(0, 50) + '...'
                                        : pair.userNode.label
                                }
                                aria-label={`Navigate to: ${pair.userNode.label.substring(0, 50)}`}
                            />
                        ))}
                    </div>
                )}

                {expandedPair && (
                    <div
                        key={expandedPair.id}
                        id={`expanded-pair-${expandedPair.id}`}
                        className="graph-expanded-chat-item"
                    >
                        {chatEdit.isEditing ? (
                            <div className="qa-node-edit-container">
                                <input
                                    className="qa-node-input qa-node-input--chat-mode"
                                    value={chatEdit.editContent}
                                    onChange={(e) => chatEdit.setEditContent(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            handleSaveChatEdit()
                                        } else if (e.key === 'Escape') {
                                            chatEdit.cancelEditing()
                                        }
                                    }}
                                    disabled={chatEdit.isSaving}
                                    autoFocus
                                    placeholder="Edit your message..."
                                />
                                <div className="qa-node-edit-actions">
                                    <button
                                        className="qa-node-edit-cancel"
                                        onClick={chatEdit.cancelEditing}
                                        disabled={chatEdit.isSaving}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="qa-node-edit-save"
                                        onClick={handleSaveChatEdit}
                                        disabled={chatEdit.isSaving || !chatEdit.editContent.trim()}
                                    >
                                        {chatEdit.isSaving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                                {chatEdit.error && (
                                    <div className="qa-node-error">{chatEdit.error}</div>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="qa-bubble-row">
                                    <div className="qa-bubble qa-bubble--user">
                                        {renderUserText(expandedPair.userNode.label, expandedPair.userNode.context_ranges)}
                                    </div>
                                    <button
                                        className="qa-node-edit-icon"
                                        onClick={() =>
                                            chatEdit.startEditing(expandedPair.userNode.label)
                                        }
                                        title="Edit message"
                                    >
                                        ✎
                                    </button>
                                </div>
                                {expandedPair.aiNode && (
                                    <div ref={aiBubbleRef} className="qa-bubble qa-bubble--ai">
                                        <ReactMarkdown
                                            components={markdownComponents}
                                            remarkPlugins={remarkPlugins}
                                            rehypePlugins={rehypePlugins}
                                        >
                                            {expandedPair.aiNode.label}
                                        </ReactMarkdown>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {expandedDraft && (
                    <div className="graph-expanded-chat-item">
                        <div className="qa-node-input-only">
                            <input
                                className="qa-node-input qa-node-input--chat-mode"
                                placeholder="Ask a question..."
                                value={chatEdit.editContent}
                                onChange={(e) => chatEdit.setEditContent(e.target.value)}
                                onKeyDown={(e) => {
                                    if (
                                        e.key === 'Enter' &&
                                        !e.shiftKey &&
                                        chatEdit.editContent.trim()
                                    ) {
                                        e.preventDefault()
                                        if (expandedDraft && chatEdit.editContent.trim()) {
                                            chatEdit.setError(null)
                                            onSendDraft(
                                                expandedDraft.fromNodeIds,
                                                chatEdit.editContent,
                                                expandedDraft.id
                                            ).catch(() => chatEdit.setError('Failed to send'))
                                        }
                                    }
                                }}
                                disabled={chatEdit.isSaving}
                                autoFocus
                            />
                            <div className="qa-node-edit-actions">
                                <button
                                    className="qa-node-send-button"
                                    onClick={() => {
                                        if (expandedDraft && chatEdit.editContent.trim()) {
                                            chatEdit.setError(null)
                                            onSendDraft(
                                                expandedDraft.fromNodeIds,
                                                chatEdit.editContent,
                                                expandedDraft.id
                                            ).catch(() => chatEdit.setError('Failed to send'))
                                        }
                                    }}
                                    disabled={chatEdit.isSaving || !chatEdit.editContent.trim()}
                                    style={{ marginTop: '0.5rem' }}
                                >
                                    {chatEdit.isSaving ? 'Sending...' : 'Send'}
                                </button>
                            </div>
                            {chatEdit.error && (
                                <div className="qa-node-error">{chatEdit.error}</div>
                            )}
                        </div>
                    </div>
                )}

                {/* Navigation dots for child nodes (below) */}
                {childPairs.length > 0 && (
                    <div className="graph-nav-dots-container graph-nav-dots-container--bottom">
                        {childPairs.map((pair) => (
                            <button
                                key={pair.id}
                                type="button"
                                className="graph-nav-dot"
                                onClick={() => onNavigate(pair.id)}
                                title={
                                    pair.userNode.label.length > 50
                                        ? pair.userNode.label.substring(0, 50) + '...'
                                        : pair.userNode.label
                                }
                                aria-label={`Navigate to: ${pair.userNode.label.substring(0, 50)}`}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
