import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useStore } from "../store";
import { INBOX_ID } from "../types";
import { getApiKey } from "../apiKeys";
import { useIsMobile } from "../useIsMobile";

interface SearchResult {
  id: string;
  label: string;
  sub: string;
  run: () => void;
}

// Floating tab bar. Search is global: opening it cross-fades the tabs out and
// a full-width search field in, keeping the capsule width stable.
export function TopBar() {
  const workspaces = useStore((s) => s.workspaces);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useStore((s) => s.setActiveWorkspace);
  const fitAll = useStore((s) => s.fitAll);
  const flyToFeature = useStore((s) => s.flyToFeature);
  const moveWorkspace = useStore((s) => s.moveWorkspace);
  const layout = useStore((s) => s.layout);
  const isMobile = useIsMobile();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const tabs = workspaces.filter((ws) => ws.pinned && ws.id !== INBOX_ID);
  const hidden = layout !== "topbar";

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
    setResults([]);
  }

  // Live suggestions as you type: coordinates, matching workspaces, then places.
  useEffect(() => {
    const text = query.trim();
    setActive(0);
    if (!searchOpen || !text) {
      setResults([]);
      return;
    }
    let cancelled = false;

    const q = text.toLowerCase();
    const instant: SearchResult[] = [];
    const m = text.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const lngLat: [number, number] = [parseFloat(m[2]), parseFloat(m[1])];
      instant.push({
        id: "coord",
        label: `${m[1]}, ${m[2]}`,
        sub: "Coordinates",
        run: () => {
          flyToFeature(lngLat);
          closeSearch();
        },
      });
    }

    // Your own objects (markers / texts) across all workspaces.
    const objs: SearchResult[] = [];
    for (const ws of workspaces) {
      for (const lyr of ws.layers) {
        for (const f of lyr.features) {
          if (f.title && f.title.toLowerCase().includes(q)) {
            objs.push({
              id: "f-" + f.id,
              label: f.title,
              sub: `${ws.name} · ${f.kind === "text" ? "text" : "marker"}`,
              run: () => {
                setActiveWorkspace(ws.id);
                flyToFeature(f.lngLat);
                closeSearch();
              },
            });
          }
        }
      }
    }
    instant.push(...objs.slice(0, 6));

    workspaces
      .filter((w) => w.id !== INBOX_ID && w.name.toLowerCase().includes(text.toLowerCase()))
      .slice(0, 3)
      .forEach((w) =>
        instant.push({
          id: "ws-" + w.id,
          label: w.name,
          sub: "Workspace",
          run: () => {
            setActiveWorkspace(w.id);
            closeSearch();
          },
        }),
      );
    setResults(instant);

    const t = window.setTimeout(async () => {
      try {
        const token = getApiKey("VITE_MAPBOX_TOKEN");
        const res = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            text,
          )}.json?limit=5&access_token=${token}`,
        );
        const data = (await res.json()) as {
          features?: Array<{ id: string; text: string; place_name: string; center: [number, number] }>;
        };
        if (cancelled) return;
        const places: SearchResult[] = (data.features ?? []).map((f) => ({
          id: f.id,
          label: f.text || f.place_name,
          sub: f.place_name,
          run: () => {
            flyToFeature([f.center[0], f.center[1]]);
            closeSearch();
          },
        }));
        setResults([...instant, ...places]);
      } catch {
        /* keep instant results */
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchOpen]);

  // Coordinates "lat, lng" → fly; otherwise geocode the place (Mapbox); finally
  // fall back to jumping to a workspace by name.
  async function runSearch() {
    const text = query.trim();
    if (!text) return;

    const m = text.match(/^(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)$/);
    if (m) {
      flyToFeature([parseFloat(m[2]), parseFloat(m[1])]);
      closeSearch();
      return;
    }

    try {
      const token = getApiKey("VITE_MAPBOX_TOKEN");
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          text,
        )}.json?limit=1&access_token=${token}`,
      );
      const data = (await res.json()) as { features?: Array<{ center: [number, number] }> };
      const center = data.features?.[0]?.center;
      if (center) {
        flyToFeature([center[0], center[1]]);
        closeSearch();
        return;
      }
    } catch {
      /* ignore geocoder errors */
    }

    const ws = workspaces.find((w) => w.name.toLowerCase().includes(text.toLowerCase()));
    if (ws) setActiveWorkspace(ws.id);
    closeSearch();
  }

  const cls = "topbar" + (hidden ? " hidden" : "") + (searchOpen ? " searching" : "");

  const searchTrigger = (
    <button
      className="topbar-back search-trigger"
      title="Search"
      onClick={() => setSearchOpen(true)}
    >
      <Search size={16} />
    </button>
  );

  return (
    <>
      {/* On mobile the tab bar moves to a full-width strip at the bottom, so
          the trigger is rendered next to the map-style switcher instead —
          it can't stay nested in the capsule (its glass blur makes it the
          containing block for fixed/absolute descendants). */}
      {isMobile && !searchOpen && !hidden && searchTrigger}

      <div className={cls}>
        {!isMobile && searchTrigger}

        <div className="topbar-tabs">
        {tabs.map((ws) => (
          <button
            key={ws.id}
            className={
              "tab" +
              (ws.id === activeWorkspaceId ? " active" : "") +
              (dragId === ws.id ? " dragging" : "") +
              (overId === ws.id ? " dragover" : "")
            }
            style={{ ["--ws-color" as string]: ws.color }}
            draggable
            onClick={() =>
              ws.id === activeWorkspaceId ? fitAll() : setActiveWorkspace(ws.id)
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
              if (dragId && dragId !== ws.id) setOverId(ws.id);
            }}
            onDragLeave={() => setOverId((id) => (id === ws.id ? null : id))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragId && dragId !== ws.id) moveWorkspace(dragId, ws.id, true);
              setDragId(null);
              setOverId(null);
            }}
          >
            <span className="tab-icon">{ws.icon}</span>
            <span className="tab-name">{ws.name}</span>
          </button>
        ))}
      </div>

      {/* Full-width search overlay (cross-fades over the tabs) */}
      <div className="topbar-search-ov">
        <Search size={16} />
        <input
          ref={inputRef}
          className="ts-input"
          placeholder="Search place or lat, lng…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(results.length - 1, i + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === "Enter") {
              const sel = results[Math.min(active, results.length - 1)];
              if (sel) sel.run();
              else runSearch();
            } else if (e.key === "Escape") {
              closeSearch();
            }
          }}
        />
        <button className="topbar-back" title="Close" onClick={closeSearch}>
          <X size={16} />
        </button>
      </div>

      {searchOpen && results.length > 0 && (
        <div className="topbar-results">
          {results.map((r, i) => (
            <button
              key={r.id}
              className={i === active ? "result active" : "result"}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                r.run();
              }}
            >
              <span className="result-label">{r.label}</span>
              <span className="result-sub">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
      </div>
    </>
  );
}
