

type DeleteConfirmModalProps = {
    isOpen: boolean
    onConfirm: () => void
    onCancel: () => void
}

export function DeleteConfirmModal({ isOpen, onConfirm, onCancel }: DeleteConfirmModalProps) {
    if (!isOpen) return null

    return (
        <div className="delete-modal-backdrop">
            <div className="delete-modal" role="dialog" aria-modal="true">
                <div className="delete-modal-title">Delete selected nodes?</div>
                <div className="delete-modal-body">
                    This will delete the selected node(s) and their downstream nodes. Nodes that also have other parents will be
                    kept.
                </div>
                <div className="delete-modal-actions">
                    <button
                        type="button"
                        className="delete-modal-button delete-modal-button--secondary"
                        onClick={onCancel}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="delete-modal-button delete-modal-button--danger"
                        onClick={onConfirm}
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    )
}
