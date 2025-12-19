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

- [X] Create local-only “send message” behavior:
- [X] Sending a message only updates local state, no backend yet.
- [X] Add backend route /api/messages that just echoes or returns dummy AI text.
- [X] Connect frontend “Send” to backend /api/messages.
- [X] Ensure messages show correctly in chat area.

## Phase 4 – Graph integration (React Flow)

- [X] Represent local messages as nodes and edges for React Flow.
- [X] Connect graph component to Zustand store.
- [X] When new messages arrive (user + AI), update the graph locally.
- [X] Integrate with backend /api/graph/:conversationId so:
    - [X] On page load, you fetch the saved graph from D1.
- [X] Graph and chat are in sync after reload.

## Phase 5 – Real AI integration

- [X] Add real AI API call in /api/messages backend route:
    - [X] Load past messages from DB.
    - [X] Call AI API, parse response.
    - [X] Add environment variables for AI key in Worker.
    - [X] Add error handling and simple retry or error message to frontend.

## Phase 6 – Polishing the MVP

- [X] Improve node appearance (Tailwind-friendly, color by author).
- [X] Add loading indicators (sending message, waiting for AI).
- [X] Add simple conversation renaming and delete.
- [X] Add basic validation (empty message, max length).
- [ ] Add minimal CORS configuration and deployment scripts.

## Phase 7 – Visualization features

- [X] Add dark/light mode toggle button in top-right corner.
- [X] Add markdown rendering for AI responses (bold, italic, code, lists, etc.).

## Phase 8 – Frontend Advanced Features

- [X] Implement node expansion on double-click.
- [X] Add zoom in and zoom out based in mouse wheel, when in workflow mode
- [X] Add scroll down and scroll up based in mouse wheel, when in chat only mode
- [X] Make the sidebar collapsible.
- [X] Automatically generate the conversation title based on the first message.
- [X] Improve design of the button
- [X] Increase width of the chat window in chat mode
- [X] Increase question size in chat mode
- [X] Make personalized box when deleting a conversation
- [X] Add animation in sidebar
- [X] Improve positioning of the nodes 

## Phase 9 - AI interaction & Chat mode

- [X] Define the AI agent (configure agent type via system prompt).
- [X] Allow editing of the user’s submitted question.
- [X] Add chat mode edition and draft nodes in chat mode.
- [X] Move to next nodes in chat mode.
- [X] Use part of the question to generate the AI response, reforcing question.

## Phase 10 – Performance

- [ ] Add rate limiting for AI calls.
- [ ] Add KV-based caching for AI responses (theoretical idea).

## Phase 11 - API accessibility
- [ ] Provide easier access to the API.

## Phase 12 - Initial test functions
- [ ] Make unit tests for the API.
- [ ] Make integration tests for the API.

## Phase 13 - User Management
- [ ] Add user management to the API.
- [ ] Add user management to the web app.
- [ ] Add user management to the database.

## Phase 14 – Security Features 
Note: Implement feature from phase 6 before this phase.
- [ ] Add authentication to the web app.
- [ ] Add encryption for sensitive data.
- [ ] Authentication based in google account.

## Phase 15 - Groups & Topics
- [ ] Add group and topic to the API.
- [ ] Add groups to the web app.
- [ ] Add topics to the web app.
- [ ] Share Conversations between groups.
- [ ] Previligies for each user (Only view, edit, delete, share).

## Phase 16 - Advanced features
- [ ] Automated division of questions, one question can divide in multiple questions (user can accept or cancel)

## Phase 16 – Deployment

- [ ] Deploy frontend to Cloudflare Pages.
- [ ] Deploy backend to Cloudflare Workers.
