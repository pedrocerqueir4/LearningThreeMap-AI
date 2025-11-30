import { useEffect, useState } from 'react'
import './App.css'
import type { Conversation } from './store/conversations'
import { useConversationStore } from './store/conversations'
import { useGraphStore } from './store/graph'
import { useMessageStore } from './store/messages'
import { useThemeStore } from './store/theme'
import { ConversationGraph } from './components/ConversationGraph'

function App() {
  const {
    conversations,
    currentConversationId,
    setCurrentConversation,
    fetchConversations,
    createConversation,
    deleteConversation,
    updateConversationTitle,
    updateConversationSystemInstruction,
    loading,
    error,
  } = useConversationStore()

  const { graphByConversationId, fetchGraph } = useGraphStore()

  const { sendMessage } = useMessageStore()

  const { mode, setMode } = useThemeStore()

  const [menuConversationId, setMenuConversationId] = useState<string | null>(null)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isAgentModalOpen, setIsAgentModalOpen] = useState(false)
  const [agentInstruction, setAgentInstruction] = useState('')
  const [agentConversationId, setAgentConversationId] = useState<string | null>(null)

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  useEffect(() => {
    setMode(mode)
  }, [mode, setMode])

  useEffect(() => {
    const handleWindowClick = () => setMenuConversationId(null)
    window.addEventListener('click', handleWindowClick)
    return () => window.removeEventListener('click', handleWindowClick)
  }, [])

  const handleNewConversation = async () => {
    const current = selectedConversation

    // Check if current conversation is empty (no nodes)
    // If so, don't create a new one.
    if (current) {
      const graph = graphByConversationId[current.id]
      const hasNodes = graph && graph.nodes && graph.nodes.length > 0
      if (!hasNodes) {
        // Optionally notify user or just return
        // For now, we just return to prevent empty conversation spam
        return
      }
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

  const handleSendFromNode = async (fromNodeIds: string[] | null, content: string, draftNodeId?: string | null) => {
    if (!selectedConversation) return

    const conversationId = selectedConversation.id

    await sendMessage(conversationId, content, fromNodeIds, draftNodeId)
    await fetchGraph(conversationId)
    // Refresh conversations so any auto-generated title from the backend is
    // reflected in the sidebar list.
    await fetchConversations()
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

  const handleOpenAgentModal = (conversationId: string, currentInstruction?: string) => {
    setAgentConversationId(conversationId)
    setAgentInstruction(currentInstruction || '')
    setIsAgentModalOpen(true)
    setMenuConversationId(null)
  }

  const handleSaveAgent = async () => {
    if (agentConversationId) {
      await updateConversationSystemInstruction(agentConversationId, agentInstruction)
    }
    setIsAgentModalOpen(false)
    setAgentConversationId(null)
    setAgentInstruction('')
  }

  const handleCancelAgent = () => {
    setIsAgentModalOpen(false)
    setAgentConversationId(null)
    setAgentInstruction('')
  }

  return (
    <div className={isSidebarCollapsed ? 'app-root app-root--sidebar-collapsed' : 'app-root'}>
      <aside className={isSidebarCollapsed ? 'sidebar sidebar--collapsed' : 'sidebar'}>
        <div className="sidebar-header">
          <div className="sidebar-header-top">
            {!isSidebarCollapsed && <h1 className="app-title">LearningThreeMap</h1>}
            <button
              type="button"
              className="sidebar-toggle-button"
              onClick={() => setIsSidebarCollapsed((value) => !value)}
              aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={isSidebarCollapsed ? 'Show conversations' : 'Hide conversations'}
            >
              {isSidebarCollapsed ? '»' : '«'}
            </button>
          </div>
          {!isSidebarCollapsed && (
            <button className="primary-button" onClick={handleNewConversation} disabled={loading}>
              <span aria-hidden="true" className="primary-button-icon">
                +
              </span>
              New conversation
            </button>
          )}
        </div>
        {!isSidebarCollapsed && error && <div className="error-banner">{error}</div>}
        {!isSidebarCollapsed && (
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
                      <button
                        type="button"
                        className="conversation-menu-item"
                        onClick={() => handleOpenAgentModal(conv.id, conv.system_instruction)}
                      >
                        Define Agent
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
        )}
      </aside>
      <main className="canvas">
        <button
          className="theme-toggle-button"
          onClick={() => setMode(mode === 'light' ? 'dark' : 'light')}
          aria-label="Toggle dark mode"
          title={`Switch to ${mode === 'light' ? 'dark' : 'light'} mode`}
        >
          {mode === 'light' ? '🌙' : '☀️'}
        </button>
        <h1 className="roadmaps-title">
          Learningflow
          <span className="roadmaps-underline" />
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
      {
        isAgentModalOpen && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Define Agent</h2>
                <button className="modal-close-button" onClick={handleCancelAgent}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <p>Define the system instruction for this agent. This will guide how the AI responds in this conversation.</p>
                <textarea
                  className="agent-instruction-input"
                  value={agentInstruction}
                  onChange={(e) => setAgentInstruction(e.target.value)}
                  placeholder="e.g., You are a helpful pirate. Speak like a pirate."
                  rows={5}
                />
              </div>
              <div className="modal-footer">
                <button className="secondary-button" onClick={handleCancelAgent}>
                  Cancel
                </button>
                <button className="primary-button" onClick={handleSaveAgent}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  )
}

export default App
