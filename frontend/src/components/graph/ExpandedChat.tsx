import { useCallback, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import {
    markdownComponents,
    remarkPlugins,
    rehypePlugins,
} from '../../utils/markdown'
import type { DraftNode } from '../../types' // Verify this path
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
}: ExpandedChatProps) {
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
                                        {expandedPair.userNode.label}
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
                                    <div className="qa-bubble qa-bubble--ai">
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
