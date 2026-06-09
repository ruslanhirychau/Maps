import { Undo2, Redo2 } from "lucide-react";

// Floating undo/redo control (bottom-left). Shown only while editing an item
// (text or marker draft); it undoes/redoes the steps within that editing
// session. Hidden in plain view mode.
export function UndoRedo({
  editing,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  editing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  if (!editing) return null;
  return (
    <div className="undo-redo">
      <button
        className="ur-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (⌘Z)"
      >
        <Undo2 size={16} />
      </button>
      <button
        className="ur-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
      >
        <Redo2 size={16} />
      </button>
    </div>
  );
}
