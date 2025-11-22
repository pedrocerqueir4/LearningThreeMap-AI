# Functional Requirements
## Core Features

### FR1 – Chat interface

User can:
- Type a message in an input box inside the graph/chat view
- Send message to backend
- See AI response rendered with basic Markdown support (bold, italic, code, lists)

### FR2 – Conversation graph

- Every user message = a graph node of type `user`.
- Every AI response = a graph node of type `ai`.
- The UI groups these as QA pairs in React Flow nodes (one visual node contains both user + AI text).
- Directed edges connect user message → AI response → next user message, etc.
- Nodes can be dragged; positions are saved and restored per conversation.
- Users can create draft nodes (empty question boxes) anchored to existing nodes.
- Users can delete subtrees of the graph while preserving joined nodes.

Nodes show:
- Author (user or AI, via styling)
- Short/complete text
- Timestamp (in sidebar list via conversations)

### FR3 – Conversation persistence

Conversations are saved in Cloudflare D1:
- Conversation metadata (id, title, created_at)
- Messages (content, author, timestamp)
- Nodes and edges representing the graph, including last-known positions

When user reloads the page:
- They can load a conversation and see both:
- Chat history (implicit via graph)
- Graph view (React Flow)

### FR4 – AI response via external API

Backend receives:
- conversationId
- latest user message content
- optional fromNodeIds (selection of nodes that define the context subgraph)

Backend calls Google Gemini (Generative Language API) with:
- A conversation history built from the ancestor nodes of `fromNodeIds` (if provided)
- The latest user question

Backend returns:
- AI message text
- Graph delta (new nodes and edges)

Backend logs the messages in D1 before responding.
If no AI API key is configured, backend falls back to an echo mode.

### FR5 – Conversation management

User can:
- Start a new conversation (creates new record in D1; draft conversations are persisted on first message)
- Open an existing conversation (list + select in sidebar)
- Rename a conversation
- Delete a conversation (with confirmation UI)

### FR6 – Theme and UX polish

- User can toggle between light and dark mode.
- Theme preference is persisted across reloads.
- Sidebar can be collapsed/expanded.
- Loading indicators appear while sending messages / waiting for AI.
- Errors are displayed in the UI when backend calls fail.

## Non-Functional Requirements
### NFR1 – Performance

- Single-user MVP: acceptable latency dominated by the AI API (< a few seconds).
- Frontend should remain responsive while rendering graphs with tens/hundreds of nodes.
- Node position updates should avoid excessive backend calls in future optimizations.

### NFR2 – Reliability

- If AI call fails, user sees a clear error and the app doesn’t crash.
- Backend retries AI call once before failing.
- All DB operations are wrapped in try/catch with simple error logging.

### NFR3 – Security (MVP level)

- API keys stored server-side only as environment variables on Cloudflare (`AI_API_KEY`).
- No secrets in frontend bundle.
- CORS to allow only the deployed frontend origin in production.

### NFR4 – Maintainability

- Clear separation:
  - frontend/ (React + Vite + Zustand + React Flow)
  - backend/ (Cloudflare Worker + Hono + D1)
- Simple, documented API endpoints.
- TypeScript used on both sides.
