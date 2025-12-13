import { useState } from 'react'
import type { NodeProps } from 'reactflow'
import { Handle, Position } from 'reactflow'
import ReactMarkdown from 'react-markdown'
import { markdownComponents, remarkPlugins, rehypePlugins } from '../utils/markdown'
import type { QaNodeData } from '../types'

/**
 * QA (Question-Answer) Node component for the conversation graph
 * Handles both draft mode (for new questions) and complete mode (existing Q&A pairs)
 */
export function QaNode({ data }: NodeProps<QaNodeData>) {
    const [draft, setDraft] = useState('')
    const [sending, setSending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Edit mode state
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState('')
    const [isSavingEdit, setIsSavingEdit] = useState(false)

    const isDraft = data.mode === 'draft'

    const handleSend = async () => {
        const text = draft.trim()
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
            await data.onSend(effectiveFromNodeIds.length ? effectiveFromNodeIds : null, text, data.id)
            setDraft('')
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
                        <input
                            className="qa-node-input qa-node-input--single"
                            placeholder="Ask a question..."
                            value={draft}
                            onChange={(e) => setDraft(e.target.value.slice(0, 500))}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && draft.trim()) {
                                    e.preventDefault()
                                    handleSend()
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => e.stopPropagation()}
                            disabled={sending}
                            maxLength={500}
                        />
                        <button
                            className="qa-node-send-button"
                            onClick={(e) => {
                                e.stopPropagation()
                                handleSend()
                            }}
                            onDoubleClick={(e) => e.stopPropagation()}
                            disabled={sending || !draft.trim()}
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
                                    <div className="qa-bubble qa-bubble--user">{data.userText}</div>
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
                                            title={data.isLocked ? 'Unlock movement' : 'Lock for text selection'}
                                        >
                                            {data.isLocked ? '🔓' : '✋'}
                                        </button>
                                    )}
                                </div>
                            )
                        )}

                        {data.aiText && !isEditing && (
                            <div
                                className={`qa-bubble qa-bubble--ai${data.isLocked ? ' selectable' : ''}`}
                                onMouseUp={(e) => {
                                    if (!data.isLocked || !data.onTextSelected) return
                                    const selection = window.getSelection()
                                    const selectedText = selection?.toString().trim()
                                    if (selectedText && selectedText.length > 0) {
                                        e.stopPropagation()
                                        data.onTextSelected(selectedText, data.id)
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
