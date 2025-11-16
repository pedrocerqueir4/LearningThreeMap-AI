import { useEffect } from 'react'
import './App.css'
import type { Conversation } from './store/conversations'
import { useConversationStore } from './store/conversations'
import { useGraphStore } from './store/graph'

function App() {
  const {
    conversations,
    currentConversationId,
    setCurrentConversation,
    fetchConversations,
    createConversation,
    loading,
    error,
  } = useConversationStore()

  const { graphByConversationId, loadingByConversationId, errorByConversationId, fetchGraph } =
    useGraphStore()

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const handleNewConversation = async () => {
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

  return (
    <div className="app-root">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="app-title">LearningThreeMap</h1>
          <button className="primary-button" onClick={handleNewConversation} disabled={loading}>
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
              onClick={() => setCurrentConversation(conv.id)}
            >
              <div className="conversation-title">{conv.title}</div>
              <div className="conversation-meta">{new Date(conv.created_at).toLocaleString()}</div>
            </li>
          ))}
          {conversations.length === 0 && !loading && (
            <li className="conversation-empty">No conversations yet. Create one to get started.</li>
          )}
        </ul>
      </aside>
      <main className="canvas">
        <h1 className="roadmaps-title">Roadmaps</h1>
        <section className="roadmap-graph">
          {conversations.length === 0 && (
            <div className="roadmap-empty">Your roadmap will appear here once you create conversations.</div>
          )}
          {conversations.length > 0 && !selectedConversation && (
            <div className="roadmap-empty">Select a conversation from the left to see its roadmap.</div>
          )}
          {selectedConversation && (
            <div className="roadmap-column">
              <div className="roadmap-node">{selectedConversation.title}</div>
              <div className="roadmap-connector" />
              {loadingByConversationId[selectedConversation.id] && (
                <div className="roadmap-empty">Loading workflow…</div>
              )}
              {errorByConversationId[selectedConversation.id] && (
                <div className="roadmap-empty">
                  Failed to load workflow: {errorByConversationId[selectedConversation.id]}
                </div>
              )}
              {!loadingByConversationId[selectedConversation.id] &&
                !errorByConversationId[selectedConversation.id] &&
                graphByConversationId[selectedConversation.id] &&
                graphByConversationId[selectedConversation.id].nodes.length === 0 && (
                  <div className="roadmap-empty">No steps yet for this conversation.</div>
                )}
              {!loadingByConversationId[selectedConversation.id] &&
                !errorByConversationId[selectedConversation.id] &&
                graphByConversationId[selectedConversation.id] &&
                graphByConversationId[selectedConversation.id].nodes.length > 0 &&
                graphByConversationId[selectedConversation.id].nodes.map((node) => (
                  <div key={node.id}>
                    <div className="roadmap-node">{node.label}</div>
                    <div className="roadmap-connector" />
                  </div>
                ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

export default App
