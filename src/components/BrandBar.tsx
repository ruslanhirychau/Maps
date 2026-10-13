import { PanelLeft, Key } from "lucide-react";
import { useStore } from "../store";
import { useIsMobile } from "../useIsMobile";

// Persistent top-left brand + sidebar toggle. Stays in one place; the toggle
// just slides closer to / away from the logo as the sidebar collapses/expands.
export function BrandBar() {
  const layout = useStore((s) => s.layout);
  const setLayout = useStore((s) => s.setLayout);
  const editing = useStore((s) => s.editing);
  const setKeysOpen = useStore((s) => s.setKeysOpen);
  const isMobile = useIsMobile();

  return (
    <div
      className={
        "brand-bar" +
        (layout === "sidebar" ? " expanded" : "") +
        (editing ? " hidden" : "")
      }
    >
      <span
        className="brand"
        onClick={isMobile ? () => setLayout("sidebar") : undefined}
        style={isMobile ? { cursor: "pointer" } : undefined}
      >
        Maps
      </span>
      {/* On mobile the API-keys button lives only inside the sidebar. */}
      {!isMobile && (
        <button className="icon-btn" title="API keys" onClick={() => setKeysOpen(true)}>
          <Key size={16} />
        </button>
      )}
      <button
        className="icon-btn"
        title={layout === "sidebar" ? "Collapse" : "Expand"}
        onClick={() => setLayout(layout === "sidebar" ? "topbar" : "sidebar")}
      >
        <PanelLeft size={16} />
      </button>
    </div>
  );
}
