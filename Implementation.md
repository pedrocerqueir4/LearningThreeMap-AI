# Step-by-Step Implementation Plan
## Phase 0 – Project setup

- [X] Create a git repo and base folder structure (frontend, backend).
- [X] Initialize frontend with Vite (React + TS).
- [X] Initialize backend as a Cloudflare Worker project with Hono.
- [X] Configure local dev scripts so you can:
    - [X] Run frontend dev server.
    - [X] Run backend Worker locally (wrangler dev or similar).

## Phase 1 – Backend skeleton (no AI yet)

- [X] Define D1 schema (SQL) with conversations, messages, nodes, edges.
- [X] Set up Hono routes:
    - [X] POST /api/conversations (creates new conversation).
    - [X] GET /api/conversations (lists conversations).
    - [X] GET /api/graph/:conversationId (returns all nodes/edges).
- [X] Implement D1 access helpers for these routes.
- [X] Test with HTTP client (Postman, curl, Insomnia).

## Phase 2 – Frontend basic structure

- [X] Create basic layout:
    - [X] Conversation list view.
    - [X] Conversation view with placeholder chat and graph areas.
- [X] Set up Zustand store slices for conversations, messages, and graph.
- [X] Integrate with backend:
    - [X] Load conversation list from /api/conversations.
    - [X] Create new conversation from UI.

## Phase 3 – Chat without AI (echo or dummy)

- [ ] Create local-only “send message” behavior:
- [ ] Sending a message only updates local state, no backend yet.
- [ ] Add backend route /api/messages that just echoes or returns dummy AI text.
- [ ] Connect frontend “Send” to backend /api/messages.
- [ ] Ensure messages show correctly in chat area.

## Phase 4 – Graph integration (React Flow)

- [ ] Represent local messages as nodes and edges for React Flow.
- [ ] Connect graph component to Zustand store.
- [ ] When new messages arrive (user + AI), update the graph locally.
- [ ] Integrate with backend /api/graph/:conversationId so:
- [ ] On page load, you fetch the saved graph from D1.
- [ ] Graph and chat are in sync after reload.

## Phase 5 – Real AI integration

- [ ] Add real AI API call in /api/messages backend route:
- [ ] Load past messages from DB.
- [ ] Call AI API, parse response.
- [ ] Add environment variables for AI key in Worker.
- [ ] Add error handling and simple retry or error message to frontend.

## Phase 6 – Polishing the MVP

- [ ] Improve node appearance (Tailwind-friendly, color by author).
- [ ] Add loading indicators (sending message, waiting for AI).
- [ ] Add simple conversation renaming and delete.
- [ ] Add basic validation (empty message, max length).
- [ ] Add minimal CORS configuration and deployment scripts.