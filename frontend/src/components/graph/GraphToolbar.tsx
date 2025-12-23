

type GraphToolbarProps = {
    selectionMode: 'none' | 'ask' | 'delete'
    onToggleAsk: () => void
    onToggleDelete: () => void
    onCreateRoot: () => void
}

export function GraphToolbar({
    selectionMode,
    onToggleAsk,
    onToggleDelete,
    onCreateRoot,
}: GraphToolbarProps) {
    return (
        <div className="graph-toolbar">
            <button type="button" className="graph-toolbar-button" onClick={onCreateRoot}>
                <span className="graph-toolbar-button-icon">+</span>
                <span className="graph-toolbar-button-label">New starting node</span>
            </button>
            <button
                type="button"
                className={
                    selectionMode === 'ask'
                        ? 'graph-toolbar-button graph-toolbar-button--active'
                        : 'graph-toolbar-button'
                }
                onClick={onToggleAsk}
            >
                <span className="graph-toolbar-button-icon">?</span>
                <span className="graph-toolbar-button-label">
                    {selectionMode === 'ask' ? 'Confirm selection' : 'Ask about selection'}
                </span>
            </button>
            <button
                type="button"
                className={
                    selectionMode === 'delete'
                        ? 'graph-toolbar-button graph-toolbar-button--active'
                        : 'graph-toolbar-button'
                }
                onClick={onToggleDelete}
            >
                <span className="graph-toolbar-button-icon">
                    {selectionMode === 'delete' ? '✓' : '×'}
                </span>
                <span className="graph-toolbar-button-label">
                    {selectionMode === 'delete' ? 'Confirm delete' : 'Delete node'}
                </span>
            </button>
        </div>
    )
}
