import { useState, useRef, useEffect } from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import ReactMarkdown from 'react-markdown'
import { markdownComponents, remarkPlugins, rehypePlugins } from '../utils/markdown'
import type { QaNodeData, ContextRange } from '../types'

/**
 * QA (Question-Answer) Node component for the conversation graph
 * Handles both draft mode (for new questions) and complete mode (existing Q&A pairs)
 */
export function QaNode({ data }: NodeProps<QaNodeData>) {
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState('')
    const [isSavingEdit, setIsSavingEdit] = useState(false)

    const isDraft = data.mode === 'draft'

    // Content reference for the contentEditable element
    const contentRef = useRef<HTMLDivElement>(null)
    // Use ref instead of state to avoid triggering re-renders when marking contexts as processed
    // This prevents duplicate insertions in React StrictMode
    const processedContextIdsRef = useRef<Set<string>>(new Set())

    // Handle new pending contexts
    useEffect(() => {
        if (!isDraft || !data.pendingContexts || !contentRef.current) return

        const newContexts = data.pendingContexts.filter(c => !processedContextIdsRef.current.has(c.id))
        if (newContexts.length === 0) return

        // Mark as processed immediately to avoid double insertion
        newContexts.forEach(c => processedContextIdsRef.current.add(c.id))

        // Insert blocks
        const selection = window.getSelection()
        let range: Range | null = null
        if (selection && selection.rangeCount > 0 && contentRef.current.contains(selection.anchorNode)) {
            range = selection.getRangeAt(0)
        } else {
            // Default to end if no selection in our element
            range = document.createRange()
            range.selectNodeContents(contentRef.current)
            range.collapse(false)
        }

        newContexts.forEach(context => {
            const span = document.createElement('span')
            span.contentEditable = 'false'
            span.className = 'qa-context-block qa-context-block--draft'
            span.dataset.contextText = context.text
            span.dataset.sourceNodeId = context.sourceNodeId
            // Store source positions for correlation
            if (context.sourceStartPos !== undefined) {
                span.dataset.sourceStartPos = String(context.sourceStartPos)
            }
            if (context.sourceEndPos !== undefined) {
                span.dataset.sourceEndPos = String(context.sourceEndPos)
            }
            const displayText = context.text.length > 20 ? context.text.substring(0, 20) + '...' : context.text
            span.innerText = ` "${displayText}" `

            // Add a space after
            const space = document.createTextNode('\u00A0')

            range?.insertNode(space)
            range?.insertNode(span)
            // Move cursor after
            range?.setStartAfter(space)
            range?.setEndAfter(space)
        })

        // Restore focus
        if (contentRef.current) {
            contentRef.current.focus()
            if (range) {
                selection?.removeAllRanges()
                selection?.addRange(range)
            }
        }
    }, [data.pendingContexts, isDraft])

    /**
     * Serialize content from contentEditable, extracting plain text and context ranges.
     * Returns { text: string, contextRanges: ContextRange[] }
     */
    const serializeContent = (): { text: string; contextRanges: ContextRange[] } => {
        if (!contentRef.current) return { text: '', contextRanges: [] }

        let text = ''
        const contextRanges: ContextRange[] = []

        contentRef.current.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.textContent
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const el = node as HTMLElement
                if (el.dataset.contextText && el.dataset.sourceNodeId) {
                    // This is a context block - record its position and use the original text
                    const contextText = el.dataset.contextText
                    const startPos = text.length
                    text += contextText
                    const endPos = text.length

                    const range: ContextRange = {
                        sourceNodeId: el.dataset.sourceNodeId,
                        startPos,
                        endPos,
                    }
                    // Include source positions if present
                    if (el.dataset.sourceStartPos !== undefined) {
                        range.sourceStartPos = parseInt(el.dataset.sourceStartPos, 10)
                    }
                    if (el.dataset.sourceEndPos !== undefined) {
                        range.sourceEndPos = parseInt(el.dataset.sourceEndPos, 10)
                    }
                    contextRanges.push(range)
                } else {
                    text += el.innerText
                }
            }
        })

        return { text: text.trim(), contextRanges }
    }

    /**
     * Render user text with context ranges highlighted as spans.
     * Uses contextRanges from database for complete nodes.
     */
    const renderUserText = (text: string) => {
        const ranges = data.contextRanges

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
            const isClickable = !!data.onNavigateToSource
            elements.push(
                <span
                    key={`context-${index}`}
                    className={`qa-context-block qa-context-block--permanent${isClickable ? ' clickable' : ''}`}
                    title={isClickable ? `Click to navigate to source` : contextText}
                    onClick={isClickable ? (e) => {
                        e.stopPropagation()
                        // Pass the actual context text for highlighting in the source node
                        data.onNavigateToSource?.(range.sourceNodeId, contextText)
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

    // Ref for the AI bubble to apply DOM-based highlighting
    const aiBubbleRef = useRef<HTMLDivElement>(null)

    // Effect to highlight text in the AI bubble when highlightText changes
    useEffect(() => {
        if (!data.highlightText || !aiBubbleRef.current) return

        const highlightText = data.highlightText
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
        let matchStart = combinedText.indexOf(highlightText)
        let effectiveHighlightText = highlightText

        // If no exact match, try normalized whitespace match
        if (matchStart < 0) {
            const normalizedSearch = normalizeWhitespace(highlightText)
            const normalizedCombined = normalizeWhitespace(combinedText)
            const normalizedMatchStart = normalizedCombined.indexOf(normalizedSearch)

            if (normalizedMatchStart >= 0) {
                // Find the approximate position in the original text
                // by counting non-whitespace characters up to the match
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
            // Calculate local offsets within this text node
            const localStart = Math.max(0, matchStart - tn.start)
            const localEnd = Math.min(tn.node.textContent?.length || 0, matchEnd - tn.start)
            nodesToHighlight.push({ node: tn.node, localStart, localEnd })
        }

        // Wrap the matched portions in each overlapping text node
        // Process in reverse order to avoid offset issues
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

        // Cleanup: remove highlight spans after animation (they have 2s animation)
        return () => {
            const highlightSpans = container.querySelectorAll('.qa-context-block--highlight')
            highlightSpans.forEach(span => {
                const parent = span.parentNode
                if (parent) {
                    // Replace span with its text content
                    const text = document.createTextNode(span.textContent || '')
                    parent.replaceChild(text, span)
                    // Normalize to merge adjacent text nodes
                    parent.normalize()
                }
            })
        }
    }, [data.highlightText])

    const handleSend = async () => {
        const { text, contextRanges } = serializeContent()
        if (!isDraft || !text || sending) return
        setSending(true)
        setError(null)
        try {
            const effectiveFromNodeIds =
                data.fromNodeIds && data.fromNodeIds.length
                    ? data.fromNodeIds
                    : data.anchorNodeId
                        ? [data.anchorNodeId]
                        : []

            await data.onSend(
                effectiveFromNodeIds.length ? effectiveFromNodeIds : null,
                text,
                data.id,
                contextRanges.length > 0 ? contextRanges : null
            )
            if (contentRef.current) contentRef.current.innerText = ''
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to send message')
        } finally {
            setSending(false)
        }
    }

    const startEditing = () => {
        setEditContent(data.userText || '')
        setIsEditing(true)
        setError(null)
    }

    const cancelEditing = () => {
        setIsEditing(false)
        setEditContent('')
        setError(null)
    }

    const saveEdit = async () => {
        const text = editContent.trim()
        if (!text || text === data.userText) {
            cancelEditing()
            return
        }

        setIsSavingEdit(true)
        setError(null)
        try {
            await data.onEdit(data.id, text)
            setIsEditing(false)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save edit')
        } finally {
            setIsSavingEdit(false)
        }
    }

    return (
        <div className={data.isZoomed ? 'qa-node qa-node--zoomed' : 'qa-node'}>
            <Handle type="target" position={Position.Top} className="qa-node-handle" />
            <Handle type="source" position={Position.Bottom} className="qa-node-handle" />
            {isDraft ? (
                <>
                    {error && <div className="qa-node-error">{error}</div>}
                    <div className="qa-node-input-only">
                        <div
                            ref={contentRef}
                            className="qa-node-input qa-node-input--single qa-node-input--content-editable nodrag"
                            contentEditable={!sending}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            onPaste={(e) => {
                                e.preventDefault()
                                const text = e.clipboardData.getData('text/plain')
                                document.execCommand('insertText', false, text)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                        />
                        <button
                            className="qa-node-send-button"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleSend()
                            }}
                            onDoubleClick={(e) => e.stopPropagation()}
                            disabled={sending}
                            type="button"
                            title={sending ? 'Sending...' : 'Send message'}
                        >
                            {sending ? (
                                <>
                                    <span className="qa-node-send-spinner">⟳</span> Sending...
                                </>
                            ) : (
                                <>
                                    <span className="qa-node-send-plus">+</span> Send
                                </>
                            )}
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <div className="qa-node-body">
                        {isEditing ? (
                            <div className="qa-node-edit-container">
                                <input
                                    className="qa-node-input"
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault()
                                            saveEdit()
                                        } else if (e.key === 'Escape') {
                                            cancelEditing()
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                    disabled={isSavingEdit}
                                    autoFocus
                                />
                                <div className="qa-node-edit-actions">
                                    <button
                                        className="qa-node-edit-cancel"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            cancelEditing()
                                        }}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        disabled={isSavingEdit}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        className="qa-node-edit-save"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            saveEdit()
                                        }}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        disabled={isSavingEdit || !editContent.trim()}
                                    >
                                        {isSavingEdit ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            data.userText && (
                                <div className="qa-bubble-row">
                                    <div className="qa-bubble qa-bubble--user">{renderUserText(data.userText)}</div>
                                    <button
                                        className="qa-node-edit-icon"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            startEditing()
                                        }}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                        title="Edit question"
                                    >
                                        ✎
                                    </button>
                                    {data.onToggleLockMode && (
                                        <button
                                            className={`qa-node-lock-icon${data.isLocked ? ' active' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                data.onToggleLockMode?.()
                                            }}
                                            onDoubleClick={(e) => e.stopPropagation()}
                                            title={data.isLocked ? 'Disable text selection' : 'Enable text selection'}
                                        >
                                            {data.isLocked ? '❌' : '❓'}
                                        </button>
                                    )}
                                </div>
                            )
                        )}

                        {data.aiText && !isEditing && (
                            <div
                                ref={aiBubbleRef}
                                className={`qa-bubble qa-bubble--ai${data.isLocked ? ' selectable' : ''}`}
                                onMouseUp={(e) => {
                                    if (!data.isLocked || !data.onTextSelected) return
                                    const selection = window.getSelection()
                                    if (!selection || selection.rangeCount === 0) return
                                    const selectedText = selection.toString().trim()
                                    if (selectedText && selectedText.length > 0) {
                                        // Only send position and node ID, not the text itself
                                        // Text will be read fresh when user clicks a menu option
                                        const range = selection.getRangeAt(0)
                                        const rect = range.getBoundingClientRect()
                                        e.stopPropagation()
                                        data.onTextSelected(data.id, rect)
                                    }
                                }}
                            >
                                <ReactMarkdown
                                    components={markdownComponents}
                                    remarkPlugins={remarkPlugins}
                                    rehypePlugins={rehypePlugins}
                                >
                                    {data.aiText}
                                </ReactMarkdown>
                            </div>
                        )}

                    </div>
                    {error && <div className="qa-node-error">{error}</div>}
                    <button
                        type="button"
                        className="qa-node-dot"
                        onClick={(e) => {
                            e.stopPropagation()
                            data.onCreateDraftBelow(data.id, data.anchorNodeId ?? null)
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                    >
                        +
                    </button>
                </>
            )}
        </div>
    )
}
