import { useEffect, useState } from "react";
import { Ellipsis, Plus, PanelLeft, Search, FolderPlus } from "lucide-react";
import { useStore } from "../store";
import { WorkspaceEditor } from "./WorkspaceEditor";
import { INBOX_ID, type Workspace } from "../types";

export function Sidebar() {
  const workspaces = useStore((s) => s.workspaces);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const addFolder = useStore((s) => s.addFolder);
  const fitAll = useStore((s) => s.fitAll);
  const moveWorkspace = useStore((s) => s.moveWorkspace);
  const setLayout = useStore((s) => s.setLayout);
  const setEditing = useStore((s) => s.setEditing);
  const layout = useStore((s) => s.layout);

  const [editor, setEditor] = useState<"create" | string | null>(null);
  const [closing, setClosing] = useState(false);
  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Close with an exit animation, then unmount once it finishes.
  function closeEditor() {
    setClosing(true);
    window.setTimeout(() => {
      setEditor(null);
      setClosing(false);
    }, 500);
  }

  // Inbox is a hidden bucket for notes added from "Everything" — not shown.
  const visible = workspaces.filter((w) => w.id !== INBOX_ID);
  const q = query.trim().toLowerCase();
  const match = (w: Workspace) => !q || w.name.toLowerCase().includes(q);
  const pinned = visible.filter((w) => w.pinned && match(w));
  const others = visible.filter((w) => !w.pinned && match(w));

  // While editing, the sidebar shrinks to an icon rail (labels fade out).
  // On close it expands immediately while the panel keeps sliding out.
  const railMode = editor !== null && !closing;

  // Mirror rail state to the store so the brand overlay can hide while editing.
  useEffect(() => {
    setEditing(railMode);
  }, [railMode, setEditing]);

  // Open the editor for a workspace (used as the rail click), or switch to it.
  function openEditor(id: string) {
    setClosing(false);
    setActiveWorkspace(id);
    setEditor(id);
  }

  function row(ws: Workspace) {
    const active = ws.id === activeWorkspaceId;
    return (
      <div
        key={ws.id}
        className={
          "wsrow" +
          (active ? " active" : "") +
          (dragId === ws.id ? " dragging" : "") +
          (overId === ws.id ? " dragover" : "")
        }
        style={{ ["--ws-color" as string]: ws.color }}
        draggable
        onClick={() =>
          railMode ? openEditor(ws.id) : active ? fitAll() : setActiveWorkspace(ws.id)
        }
        onDragStart={(e) => {
          setDragId(ws.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverId(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (dragId && dragId !== ws.id) setOverId(ws.id);
        }}
        onDragLeave={() => setOverId((id) => (id === ws.id ? null : id))}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (dragId && dragId !== ws.id) moveWorkspace(dragId, ws.id, ws.pinned);
          setDragId(null);
          setOverId(null);
        }}
      >
        <span className="wsrow-icon">{ws.icon}</span>
        <span className="wsrow-name">{ws.name}</span>
        <button
          className="wsrow-act"
          title="Edit workspace"
          onClick={(e) => {
            e.stopPropagation();
            setEditor(ws.id);
          }}
        >
          <Ellipsis size={15} />
        </button>
      </div>
    );
  }

  // Drop into a group's empty space → move to that group's end.
  function groupDrop(pinnedGroup: boolean) {
    return (e: React.DragEvent) => {
      e.preventDefault();
      if (dragId) moveWorkspace(dragId, null, pinnedGroup);
      setDragId(null);
      setOverId(null);
    };
  }
  const allowDrop = (e: React.DragEvent) => e.preventDefault();

  const editing =
    editor && editor !== "create"
      ? (workspaces.find((w) => w.id === editor) ?? null)
      : null;

  const asideClass =
    (layout === "sidebar" ? "sidebar" : "sidebar hidden") + (railMode ? " rail" : "");

  return (
    <>
      <aside className={asideClass}>
        <header className="app-header">
          <button
            className="icon-btn"
            title="Switch to tab bar"
            onClick={() => setLayout("topbar")}
          >
            <PanelLeft className="icon" size={16} />
          </button>
        </header>

        <div className="search">
          <Search size={15} />
          <input
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="ws-list">
          <div className="ws-group" onDragOver={allowDrop} onDrop={groupDrop(true)}>
            {pinned.map(row)}
          </div>

          <div className="ws-sep" />

          <div className="ws-group" onDragOver={allowDrop} onDrop={groupDrop(false)}>
            {others.map(row)}
          </div>

        </div>

        <div className="ws-foot">
          <button className="ws-foot-btn" onClick={() => setEditor("create")}>
            <Plus size={15} /> New workspace
          </button>
          <button
            className="ws-foot-btn"
            onClick={() => {
              setClosing(false);
              setEditor(addFolder());
            }}
          >
            <FolderPlus size={15} /> New folder
          </button>
        </div>
      </aside>

      {editor !== null && (
        <WorkspaceEditor
          key={editor}
          railed={layout === "sidebar"}
          closing={closing}
          workspace={editing}
          onClose={closeEditor}
        />
      )}
    </>
  );
}
