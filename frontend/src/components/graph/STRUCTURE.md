# Graph Component Structure

This directory contains the modularized components for the Conversation Graph.

## Directory Structure

```
frontend/src/
├── components/
│   ├── ConversationGraph.tsx       # Main container component (Entry point)
│   └── graph/                      # Sub-components specific to the graph
│       ├── ExpandedChat.tsx        # The expanded chat overlay view
│       ├── GraphToolbar.tsx        # Bottom toolbar (Ask, Delete, New Node)
│       ├── TextSelectionMenu.tsx   # Context menu for text selection
│       ├── DeleteConfirmModal.tsx  # Modal for deleting nodes
│       └── types.ts                # Shared types (Pair, ChatEditState)
│
└── hooks/
    └── graph/                      # Graph-specific custom hooks
        ├── useGraphNodes.ts        # Logic for transforming graph data into React Flow nodes/edges
        ├── useViewportPersistence.ts # Logic for saving and restoring viewport state
        └── useNodePositionSaver.ts   # Logic for saving node positions on drag stop
```

## Component Responsibilities

- **ConversationGraph**: Orchestrates the state, handles interactions, and composes the sub-components. It acts as the "Controller".
- **ExpandedChat**: Handles the rendering and interaction within the expanded chat mode.
- **useGraphNodes**: Pure logic to compute the React Flow graph state from the raw business data.
- **useViewportPersistence**: Encapsulates the side effects related to view state.
