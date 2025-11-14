# Functional Requirements
## Core Features

### FR1 – Chat interface

User can:
- Type a message in an input box
- Send message to backend
- See AI response in a chat-like panel

### FR2 – Conversation graph (roadmap)

Every user message = a node
Every AI response = a node
Directed edges connect user message → AI response → next user message, etc.
The graph layout is automatically handled by React Flow (simple layout for MVP).

Nodes show:
Author (user or AI)
Short preview of text
Timestamp

### FR3 – Conversation persistence

Conversations are saved in Cloudflare D1:
- Conversation metadata (id, title, created_at)
- Messages (content, author, timestamp)
- Nodes and edges representing the graph

When user reloads the page:
- They can load a conversation and see both:
- Chat history
- Graph view

### FR4 – AI response via external API

Backend receives:
- Conversation id
- Latest user message

Backend calls an AI API (e.g., OpenAI GPT) with:
- The conversation context (may be truncated for MVP)

Backend returns:
- AI message text

Backend logs the message in D1 before responding.

### FR5 – Basic conversation management

User can:
- Start a new conversation (creates new record in D1)
- Open an existing conversation (list + select)
- Rename conversation (optional; can be skipped for very first version)

## Non-Functional Requirements
### NFR1 – Performance

Single-user MVP: acceptable latency < a few seconds dominated by the AI API.
Frontend should not freeze while rendering small graphs (tens/hundreds of nodes).

### NFR2 – Reliability

If AI call fails, user sees a clear error and the app doesn’t crash.
All DB operations are wrapped in try/catch with simple error messages.

### NFR3 – Security (MVP level)

API keys stored server-side only as environment variables on Cloudflare.
No secrets in frontend bundle.
CORS only allow your frontend origin (once deployed).

### NFR4 – Maintainability

Clear separation:
- frontend/ (React + Vite)
- backend/ (Cloudflare Worker + Hono)
Simple, documented API endpoints.
TypeScript used on both sides.
