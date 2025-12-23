

type TextSelectionMenuProps = {
    position: { x: number; y: number } | null
    onAskAbout: () => void
    onChatInNode: () => void
    onCancel: () => void
    hasDrafts: boolean
}

export function TextSelectionMenu({
    position,
    onAskAbout,
    onChatInNode,
    onCancel,
    hasDrafts,
}: TextSelectionMenuProps) {
    if (!position) return null

    return (
        <div
            className="qa-selection-dropdown"
            style={{
                left: position.x,
                top: position.y,
                transform: 'translateX(-50%)',
            }}
        >
            <button type="button" className="qa-selection-dropdown-item" onClick={onAskAbout}>
                <span className="qa-selection-dropdown-item-icon">?</span>
                Ask about
            </button>
            <button
                type="button"
                className={`qa-selection-dropdown-item${!hasDrafts ? ' disabled' : ''}`}
                onClick={onChatInNode}
                disabled={!hasDrafts}
            >
                <span className="qa-selection-dropdown-item-icon">💬</span>
                Chat in node...
            </button>
            <button type="button" className="qa-selection-dropdown-item" onClick={onCancel}>
                <span className="qa-selection-dropdown-item-icon">×</span>
                Cancel
            </button>
        </div>
    )
}
