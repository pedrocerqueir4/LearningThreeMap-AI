# 🎨 CSS Architecture

Modularized CSS structure for the LTM AI frontend - organized by component responsibility.

---

## 📂 File Structure

```
styles/
├── index.css              # Main entry - imports all modules
├── base.css               # Global styles, variables, resets
├── layout.css             # App grid layout & canvas
├── sidebar.css            # Sidebar navigation
├── conversation-list.css  # Conversation items & menu
├── qa-node.css           # QA node cards (largest module)
├── graph.css             # Conversation graph & chat mode
├── modals.css            # Modal dialogs & dropdowns
├── roadmap.css           # Roadmap visualization
├── theme-toggle.css      # Light/dark mode toggle
└── ARCHITECTURE.md       # This file
```

---

## 🏗️ Module Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      styles/index.css                        │
│                   (Main Entry Point)                         │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  │ Imports all modules in order:
                  │
    ┌─────────────┴─────────────┐
    │                           │
    ▼                           ▼
┌─────────┐              ┌──────────────┐
│ base.css│              │ layout.css   │
│ (First) │              │              │
└─────────┘              └──────────────┘
    │                           │
    │ Provides:                 │ Depends on base
    │ • CSS variables           │ Uses:
    │ • Typography              │ • App grid
    │ • Resets                  │ • Canvas layout
    │ • Button base             │
    │                           │
    └───────────┬───────────────┘
                │
                │ All components depend on base + layout
                │
        ┌───────┴────────────────────────────────────┐
        │                                            │
        ▼                        ▼                   ▼
  ┌──────────┐           ┌──────────────┐    ┌──────────────┐
  │ sidebar  │           │conversation  │    │   qa-node    │
  │   .css   │           │  -list.css   │    │     .css     │
  └──────────┘           └──────────────┘    └──────────────┘
        │                        │                   │
        │                        │                   │
        ▼                        ▼                   ▼
  ┌──────────┐           ┌──────────────┐    ┌──────────────┐
  │  graph   │           │   modals     │    │   roadmap    │
  │   .css   │           │     .css     │    │     .css     │
  └──────────┘           └──────────────┘    └──────────────┘
        │                        │                   │
        └────────────┬───────────┴───────────────────┘
                     │
                     ▼
              ┌──────────────┐
              │ theme-toggle │
              │     .css     │
              └──────────────┘
```

**Load Order:** Base → Layout → Components

**Coupled Components:**
- `qa-node.css` ↔️ `graph.css` (QA nodes used in graph)
- `sidebar.css` ↔️ `conversation-list.css` (list lives in sidebar)

---

## 📖 Module Descriptions

### `index.css`
**Entry point** that imports all other CSS modules in the correct order.
- Ensures base styles load first
- Maintains proper CSS cascade
- Single import point for the entire application

### `base.css`
**Global foundation** for the entire application.
- Root CSS variables (`:root`)
- Typography settings (font-family, line-height, smoothing)
- Global element resets (body, button)
- Base button styling that other components extend
- Color scheme declarations

### `layout.css`
**Application structure** and main layout containers.
- `.app-root` - Main grid layout (sidebar + canvas)
- `.app-root--sidebar-collapsed` - Collapsed sidebar state
- `.canvas` - Main content area
- Grid column definitions and transitions
- Layout responsive behavior

### `sidebar.css`
**Sidebar navigation** component and its children.

**Container:**
- `.sidebar` - Main sidebar container
- `.sidebar--collapsed` - Collapsed state
- Sidebar transitions and overflow handling

**Header:**
- `.sidebar-header` - Header container
- `.sidebar-header-top` - Top row with title and toggle
- `.app-title` - Application title
- `.sidebar-toggle-button` - Collapse/expand button

**Actions:**
- `.primary-button` - New conversation button
- `.primary-button-icon` - Button icon
- `.error-banner` - Error message display

### `conversation-list.css`
**Conversation list** items and interactions.

**List:**
- `.conversation-list` - List container
- Custom scrollbar styling (`::-webkit-scrollbar`)
- Scrollbar theming

**Items:**
- `.conversation-item` - Individual conversation card
- `.conversation-item--active` - Active conversation state
- `.conversation-text` - Text container
- `.conversation-title` - Conversation title
- `.conversation-title-input` - Title editing input
- `.conversation-meta` - Metadata (date)
- `.conversation-empty` - Empty state text

**Menu:**
- `.conversation-actions` - Actions container
- `.conversation-menu-button` - Menu toggle button
- `.conversation-menu` - Dropdown menu
- `.conversation-menu-item` - Menu items (rename, define agent)
- `.conversation-menu-item-delete` - Delete action (danger style)

### `qa-node.css`
**QA node cards** - the largest and most complex module.

**Node Structure:**
- `.qa-node` - Main node container
- `.qa-node--zoomed` - Zoomed/focused state
- `.qa-node-body` - Content container
- `.react-flow__node-qa.selected` - Selected node state
- `.react-flow__node-qa.draft-selectable` - Draft selection state

**Message Bubbles:**
- `.qa-bubble` - Base bubble style
- `.qa-bubble--user` - User message bubble
- `.qa-bubble--ai` - AI response bubble
- `.qa-bubble--ai.selectable` - Selectable AI text (lock mode)
- `.qa-bubble-row` - Bubble with action buttons

**Input & Interaction:**
- `.qa-node-input` - Text input field
- `.qa-node-input-row` - Input with buttons
- `.qa-node-input-only` - Input-only container
- `.qa-node-input--chat-mode` - Chat mode specific input
- `.qa-node-input--content-editable` - Content editable input
- `.qa-node-send-button` - Send message button
- `.qa-node-send-plus` - Plus icon
- `.qa-node-send-spinner` - Loading spinner animation
- `.qa-node-dot` - Add child node button

**Edit Mode:**
- `.qa-node-edit-icon` - Edit button (hover to show)
- `.qa-node-edit-container` - Edit mode container
- `.qa-node-edit-actions` - Save/Cancel buttons
- `.qa-node-edit-save` - Save button
- `.qa-node-edit-cancel` - Cancel button

**Lock Mode:**
- `.qa-node-lock-icon` - Lock toggle button
- `.qa-node-lock-icon.active` - Active lock state

**Context Elements:**
- `.qa-context-block` - Inline context reference
- `.qa-draft-context-chip` - Draft context indicator

**Error:**
- `.qa-node-error` - Error message display

### `graph.css`
**Conversation graph** visualization and interactions.

**Container:**
- `.roadmap-graph` - Graph main container
- `.graph-shell` - Shell wrapper
- `.graph-flow` - React Flow container

**Cursor Modes:**
- `.react-flow__pane.ask-mode` - Ask mode cursor
- `.react-flow__pane.delete-mode` - Delete mode cursor

**Chat Mode:**
- `.graph-expanded-chat` - Expanded chat view
- `.graph-expanded-chat-header` - Header with close button
- `.graph-expanded-close-button` - Close chat button
- `.graph-expanded-chat-body` - Chat messages container
- `.graph-expanded-chat-item` - Individual chat item
- Animations: `@keyframes graph-chat-in`, `@keyframes graph-chat-item-transition`

**Navigation:**
- `.graph-nav-dots-container` - Dots container
- `.graph-nav-dots-container--top` - Top position
- `.graph-nav-dots-container--bottom` - Bottom position
- `.graph-nav-dot` - Individual navigation dot

**Toolbar:**
- `.graph-toolbar` - Bottom toolbar
- `.graph-toolbar-button` - Toolbar button
- `.graph-toolbar-button-icon` - Button icon
- `.graph-toolbar-button-label` - Button label
- `.graph-toolbar-button--active` - Active button state

**Banner:**
- `.chat-in-node-banner` - Chat-in-node mode indicator

### `modals.css`
**Modal dialogs** and dropdown menus.

**Generic Modal:**
- `.modal-overlay` - Full-screen overlay
- `.modal-content` - Modal container
- `.modal-header` - Header with title
- `.modal-close-button` - Close X button
- `.modal-body` - Content area
- `.modal-footer` - Footer with actions
- `.agent-instruction-input` - Agent instruction textarea
- `.secondary-button` - Secondary action button

**Delete Modal:**
- `.delete-modal-backdrop` - Delete confirmation overlay
- `.delete-modal` - Delete dialog container
- `.delete-modal-title` - Modal title
- `.delete-modal-body` - Modal message
- `.delete-modal-actions` - Action buttons
- `.delete-modal-button` - Button base
- `.delete-modal-button--secondary` - Cancel button
- `.delete-modal-button--danger` - Delete button

**Selection Dropdown:**
- `.qa-selection-dropdown` - Selection menu
- `.qa-selection-dropdown-item` - Menu item
- `.qa-selection-dropdown-item.disabled` - Disabled item
- Animation: `@keyframes dropdown-in`

### `roadmap.css`
**Roadmap visualization** component.

**Title:**
- `.roadmaps-title` - Main title
- `.roadmaps-underline` - Animated underline
- `.roadmaps-underline--active` - Active underline state

**Layout:**
- `.roadmap-column` - Vertical column layout

**Nodes:**
- `.roadmap-node` - Individual roadmap node
- `.roadmap-connector` - Connector line between nodes

**Empty State:**
- `.roadmap-empty` - Empty state message

### `theme-toggle.css`
**Theme switcher** button for light/dark mode.
- `.theme-toggle-button` - Toggle button
- Hover and active states
- Position: absolute (bottom-right of canvas)

---

## 🌓 Dark Mode Implementation

All modules include dark mode support using the `:root[data-theme='dark']` selector.

**Pattern:**
```css
/* Light mode (default) */
.component {
  background-color: #fefcf7;
  color: #111827;
}

/* Dark mode */
:root[data-theme='dark'] .component {
  background-color: #27272f;
  color: #e5e7eb;
}
```

Dark mode styles are **colocated** with their light mode counterparts in each module, making it easy to maintain color consistency and update themes together.

**Common Dark Mode Colors:**
- Background: `#1a1a1a`, `#18181b`, `#27272f`, `#1f1f24`
- Borders: `#27272f`, `#3f3f46`, `#52525b`
- Text: `#e5e7eb`, `#f9fafb`, `#9ca3af`

---

**Last Updated:** 2025-12-19  
**Total Modules:** 9 CSS files
