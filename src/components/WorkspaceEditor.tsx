import { useState } from "react";
import { useStore, PALETTE } from "../store";
import { MAP_STYLES, type MapStyleId } from "../mapStyles";
import { MARKER_SHAPES } from "../markers";
import { INBOX_ID, type Workspace } from "../types";

interface Props {
  workspace: Workspace | null; // null = create
  railed?: boolean; // sits next to the collapsed icon rail
  closing?: boolean; // playing the exit animation
  onClose: () => void;
}

const EMOJI = ["🗺️", "🍔", "✈️", "🚁", "⭐️", "📍", "🏔️", "🚗", "🏕️", "🌍", "🍕", "🏠"];

// Side panel to create or edit a workspace (edits apply live). Closed with Done.
export function WorkspaceEditor({
  workspace,
  railed = false,
  closing = false,
  onClose,
}: Props) {
  const addWorkspace = useStore((s) => s.addWorkspace);
  const updateWorkspace = useStore((s) => s.updateWorkspace);
  const removeWorkspace = useStore((s) => s.removeWorkspace);
  const allWorkspaces = useStore((s) => s.workspaces);

  // A folder aggregates other spaces (has a members list).
  const isFolder = workspace?.members !== undefined;
  const [members, setMembers] = useState<string[]>(workspace?.members ?? []);

  // Frozen on mount so the exit animation keeps showing edit fields even if the
  // workspace is deleted mid-close.
  const [isEdit] = useState(workspace !== null);
  const [name, setName] = useState(workspace?.name ?? "");
  const [icon, setIcon] = useState(workspace?.icon ?? "🗺️");
  const [color, setColor] = useState(workspace?.color ?? PALETTE[0]);
  const [style, setStyle] = useState<MapStyleId>(workspace?.style ?? "dark-v11");
  const [marker, setMarker] = useState(workspace?.marker ?? "circle");

  // Apply a change live to the edited workspace.
  const apply = (patch: Partial<Workspace>) => {
    if (isEdit && workspace) updateWorkspace(workspace.id, patch);
  };

  const onName = (v: string) => {
    setName(v);
    apply({ name: v.trim() || "Untitled" });
  };
  const onIcon = (v: string) => {
    setIcon(v);
    apply({ icon: v });
  };
  const onColor = (v: string) => {
    setColor(v);
    apply({ color: v });
  };
  const onMarker = (v: string) => {
    setMarker(v);
    apply({ marker: v });
  };
  const onStyle = (v: MapStyleId) => {
    setStyle(v);
    apply({ style: v });
  };
  const toggleMember = (id: string) => {
    const next = members.includes(id) ? members.filter((x) => x !== id) : [...members, id];
    setMembers(next);
    apply({ members: next });
  };

  function done() {
    // Create mode commits on Done; edits already applied live.
    if (!isEdit) {
      addWorkspace({ name: name.trim() || "Untitled", icon, color, style, marker });
    }
    onClose();
  }

  const title = isEdit ? name || "Untitled" : "New workspace";
  const isShape = MARKER_SHAPES.some((m) => m.id === marker);

  return (
    <div
      className={
        "editor-panel" + (railed ? " railed" : "") + (closing ? " closing" : "")
      }
      style={{ ["--accent" as string]: color }}
    >
      <header className="editor-head">
        <span className="editor-icon">{icon}</span>
        <span className="editor-title">{title}</span>
        <button className="editor-done" onClick={done}>
          Done
        </button>
      </header>

      <div className="editor-body">
        <>
            <label className="field">
              <span>Name</span>
              <input
                className="text-input"
                value={name}
                placeholder="e.g. Want to go"
                onChange={(e) => onName(e.target.value)}
              />
            </label>

            <div className="field">
              <span>Icon</span>
              <div className="emoji-grid">
                {EMOJI.map((e) => (
                  <button
                    key={e}
                    className={e === icon ? "emoji active" : "emoji"}
                    onClick={() => onIcon(e)}
                  >
                    {e}
                  </button>
                ))}
                <input
                  className="emoji-input"
                  value={icon}
                  maxLength={4}
                  title="Or type any emoji"
                  onChange={(e) => onIcon(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <span>Color</span>
              <div className="swatch-row">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    className={c === color ? "color-swatch active" : "color-swatch"}
                    style={{ background: c }}
                    onClick={() => onColor(c)}
                  />
                ))}
              </div>
            </div>

            {!isFolder && (
              <div className="field">
                <span>Marker</span>
                <div className="emoji-grid">
                  {MARKER_SHAPES.map((m) => (
                    <button
                      key={m.id}
                      className={m.id === marker ? "emoji active" : "emoji"}
                      style={{ color }}
                      title={m.label}
                      onClick={() => onMarker(m.id)}
                    >
                      {m.glyph}
                    </button>
                  ))}
                  <input
                    className="emoji-input"
                    value={isShape ? "" : marker}
                    maxLength={4}
                    placeholder="🙂"
                    title="Or type any emoji"
                    onChange={(e) => onMarker(e.target.value || "circle")}
                  />
                </div>
              </div>
            )}
        </>

        {isFolder && (
          <div className="field">
            <span>Spaces</span>
            <div className="member-list">
              {allWorkspaces
                .filter((w) => !w.members && w.id !== INBOX_ID)
                .map((w) => (
                  <label key={w.id} className="member">
                    <input
                      type="checkbox"
                      checked={members.includes(w.id)}
                      onChange={() => toggleMember(w.id)}
                    />
                    <span className="member-icon">{w.icon}</span>
                    <span className="member-name">{w.name}</span>
                  </label>
                ))}
            </div>
          </div>
        )}

        <div className="field">
          <span>Map style</span>
          <div className="style-grid">
            {MAP_STYLES.map((s) => (
              <button
                key={s.id}
                className={s.id === style ? "style-card active" : "style-card"}
                title={s.hint}
                onClick={() => onStyle(s.id)}
              >
                <span className="style-label">{s.label}</span>
                <span className="style-hint">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {isEdit && workspace && (
          <button
            className="btn danger editor-delete"
            onClick={() => {
              removeWorkspace(workspace.id);
              onClose();
            }}
          >
            Delete workspace
          </button>
        )}
      </div>
    </div>
  );
}
