import { useEffect, useState } from 'react'
import './App.css'
import type { Conversation } from './store/conversations'
import { useConversationStore } from './store/conversations'
import { useGraphStore } from './store/graph'
import { useMessageStore } from './store/messages'
import { ConversationGraph } from './components/ConversationGraph'

function App() {
  const {
    conversations,
    currentConversationId,
    setCurrentConversation,
    fetchConversations,
    createConversation,
    persistDraftConversation,
    touchConversation,
    deleteConversation,
    updateConversationTitle,
    loading,
    error,
  } = useConversationStore()

  const { graphByConversationId, fetchGraph } = useGraphStore()

  const { sendMessage } = useMessageStore()

  const [menuConversationId, setMenuConversationId] = useState<string | null>(null)
  const [isTitleLoading, setIsTitleLoading] = useState(false)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  useEffect(() => {
    const handleWindowClick = () => setMenuConversationId(null)
    window.addEventListener('click', handleWindowClick)
    return () => window.removeEventListener('click', handleWindowClick)
  }, [])

  const handleNewConversation = async () => {
    const current = selectedConversation

    // If the current conversation is a local draft (not in DB yet),
    // don't create another draft. Instead, bump its timestamp and
    // trigger the title underline animation as visual feedback.
    if (current?.isDraft) {
      touchConversation(current.id)
      setIsTitleLoading(true)
      window.setTimeout(() => setIsTitleLoading(false), 600)
      return
    }

    await createConversation()
  }

  const selectedConversation =
    conversations.find((c) => c.id === currentConversationId) ?? conversations[0] ?? null

  // Load graph when selected conversation changes
  useEffect(() => {
    if (!selectedConversation) return
    const conversationId = selectedConversation.id
    // Only fetch if we don't already have it
    if (!graphByConversationId[conversationId]) {
      void fetchGraph(conversationId)
    }
  }, [selectedConversation, graphByConversationId, fetchGraph])

  const handleSendFromNode = async (fromNodeIds: string[] | null, content: string) => {
    if (!selectedConversation) return

    let conversationId = selectedConversation.id

    // Persist draft conversation to backend on first message so it's not empty in DB
    if (selectedConversation.isDraft) {
      const persisted = await persistDraftConversation(selectedConversation.id)
      if (!persisted) return
      conversationId = persisted.id
    }

    await sendMessage(conversationId, content, fromNodeIds)
    await fetchGraph(conversationId)
  }

  const handleToggleMenu = (event: React.MouseEvent, conversationId: string) => {
    event.stopPropagation()
    setMenuConversationId((current) => (current === conversationId ? null : conversationId))
  }

  const handleDeleteConversation = async (conversationId: string) => {
    await deleteConversation(conversationId)
    setMenuConversationId(null)
  }

  const handleStartEditTitle = (conversationId: string, currentTitle: string) => {
    setEditingConversationId(conversationId)
    setEditingTitle(currentTitle)
    setMenuConversationId(null)
  }

  const handleSaveTitle = async (conversationId: string) => {
    if (editingTitle.trim().length === 0) {
      setEditingConversationId(null)
      return
    }
    await updateConversationTitle(conversationId, editingTitle.trim())
    setEditingConversationId(null)
  }

  const handleCancelEditTitle = () => {
    setEditingConversationId(null)
    setEditingTitle('')
  }

  return (
    <div className="app-root">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-title">LearningThreeMap</h1>
          <button className="primary-button" onClick={handleNewConversation} disabled={loading}>
            <span aria-hidden="true" className="primary-button-icon">
              +
            </span>
            New conversation
          </button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <ul className="conversation-list">
          {conversations.map((conv: Conversation) => (
            <li
              key={conv.id}
              className={
                conv.id === currentConversationId
                  ? 'conversation-item conversation-item--active'
                  : 'conversation-item'
              }
              onClick={() => {
                setCurrentConversation(conv.id)
                setMenuConversationId(null)
              }}
            >
              <div className="conversation-text">
                {editingConversationId === conv.id ? (
                  <input
                    type="text"
                    className="conversation-title-input"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => handleSaveTitle(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveTitle(conv.id)
                      if (e.key === 'Escape') handleCancelEditTitle()
                    }}
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <div
                      className="conversation-title"
                      onDoubleClick={() => handleStartEditTitle(conv.id, conv.title)}
                    >
                      {conv.title}
                    </div>
                    <div className="conversation-meta">{new Date(conv.created_at).toLocaleString()}</div>
                  </>
                )}
              </div>
              <div className="conversation-actions">
                <button
                  type="button"
                  className="conversation-menu-button"
                  aria-haspopup="menu"
                  aria-expanded={menuConversationId === conv.id}
                  onClick={(event) => handleToggleMenu(event, conv.id)}
                >
                  ⋯
                </button>
                {menuConversationId === conv.id && (
                  <div className="conversation-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      className="conversation-menu-item"
                      onClick={() => handleStartEditTitle(conv.id, conv.title)}
                    >
                      Change title
                    </button>
                    <button
                      type="button"
                      className="conversation-menu-item"
                      onClick={() => handleDeleteConversation(conv.id)}
                    >
                      Delete conversation
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
          {conversations.length === 0 && !loading && (
            <li className="conversation-empty">No conversations yet. Create one to get started.</li>
          )}
        </ul>
      </aside>
      <main className="canvas">
        <h1 className="roadmaps-title">
          Learningflow
          <span
            className={
              isTitleLoading
                ? 'roadmaps-underline roadmaps-underline--active'
                : 'roadmaps-underline'
            }
          />
        </h1>
        <section className="roadmap-graph">
          {conversations.length === 0 && (
            <div className="roadmap-empty">Your roadmap will appear here once you create conversations.</div>
          )}
          {conversations.length > 0 && !selectedConversation && (
            <div className="roadmap-empty">Select a conversation from the left to see its roadmap.</div>
          )}
          {selectedConversation && (
            <ConversationGraph
              conversationId={selectedConversation.id}
              graph={graphByConversationId[selectedConversation.id] ?? null}
              onSendFromNode={handleSendFromNode}
            />
          )}
        </section>
      </main>
    </div>
  )
}

export default App
