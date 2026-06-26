import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { displayedWorkspaces } from "./map/shared";
import { useIssLayer } from "./map/useIssLayer";
import { useAircraftLayer } from "./map/useAircraftLayer";
import { useShipsLayer } from "./map/useShipsLayer";
import { useLightningLayer } from "./map/useLightningLayer";
import { useMeteoritesLayer } from "./map/useMeteoritesLayer";
import { useFiresLayer } from "./map/useFiresLayer";
import { useCablesLayer } from "./map/useCablesLayer";
import { useCovidLayer } from "./map/useCovidLayer";
import { useNuclearLayer } from "./map/useNuclearLayer";
import { useCrashesLayer } from "./map/useCrashesLayer";
import { useWrecksLayer } from "./map/useWrecksLayer";
import { useTectonicsLayer } from "./map/useTectonicsLayer";
import { useUnescoLayer } from "./map/useUnescoLayer";
import { useAirLayer } from "./map/useAirLayer";
import { useNukeTestsLayer } from "./map/useNukeTestsLayer";
import { useCo2Layer } from "./map/useCo2Layer";
import { useRainLayer } from "./map/useRainLayer";
import { RainTimeline } from "./map/RainTimeline";
import { addBaseLayers, ensureMarkerImage, toGeoJSON } from "./map/mapPrimitives";
import { attachBaseLayerHoverPopups } from "./map/layerRegistry";
import { useDrawShapes } from "./map/useDrawShapes";
import { DrawTools } from "./map/DrawTools";
import { UndoRedo } from "./map/UndoRedo";
import { CenterPin, MarkerForm, type MarkerDraft } from "./map/MarkerForm";
import { useDraftHistory } from "./map/useDraftHistory";
import { useStore, selectActiveWorkspace } from "../store";
import { styleUrl, isDarkStyle, DEFAULT_STYLE } from "../mapStyles";
import { markerGlyph } from "../markers";
import { loadView, saveView } from "../storage";
import { getApiKey } from "../apiKeys";
import {
  Type,
  Check,
  Bold,
  RotateCw,
  Trash2,
  X,
  ScanSearch,
} from "lucide-react";
import { MapStyleSwitcher } from "./MapStyleSwitcher";
import { MapCompass } from "./MapCompass";
import { RAIN_ID, type Feature } from "../types";

// In-progress inline text being typed directly on the map canvas. `id` set =
// editing an existing label; unset = creating a new one.
interface TextDraft {
  id?: string;
  lngLat: [number, number];
  text: string;
  size: number;
  rotation: number;
  color: string;
  bold: boolean;
  // When true the label scales with zoom (anchored at `anchorZoom`), so it's
  // tiny/invisible when zoomed out and only readable when you zoom back in.
  zoomScale: boolean;
  anchorZoom: number;
}

const TEXT_COLORS = ["#ffffff", "#ffd43b", "#ff6b6b", "#4dabf7", "#69db7c", "#212529"];


// Left padding (px) applied to the map when the sidebar overlays it, so the
// optical center / vanishing point sits in the visible area, not under the bar.
const SIDEBAR_PAD = 296; // sidebar width (280) + 8px gap on each side
const leftPad = (layout: string) => (layout === "sidebar" ? SIDEBAR_PAD : 0);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

export function MapView() {
  const TOKEN = getApiKey("VITE_MAPBOX_TOKEN");
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const loadedRef = useRef(false);

  // Marker draft: a pin pinned to screen-center + a bottom form (note/icon/colour).
  // Each draft carries its own local undo/redo (steps within editing this item).
  const markerH = useDraftHistory<MarkerDraft>();
  const markerDraft = markerH.value;
  const markerDraftRef = useRef(false);
  markerDraftRef.current = markerDraft !== null;
  // Inline on-canvas text editor (create or edit a label by typing on the map).
  const textH = useDraftHistory<TextDraft>();
  const textDraft = textH.value;
  const editingTextRef = useRef(false);
  editingTextRef.current = textDraft !== null;
  // Lets the map click handler open the inline editor for an existing label.
  const openTextEditRef = useRef<(d: TextDraft) => void>(() => {});
  openTextEditRef.current = (d: TextDraft) => {
    textH.open(d);
  };
  // Keyboard undo/redo targets whichever editor is currently open (text/marker).
  const editorKeysRef = useRef<{ undo: () => void; redo: () => void; has: boolean }>({
    undo: () => {},
    redo: () => {},
    has: false,
  });
  editorKeysRef.current = textH.value
    ? { undo: textH.undo, redo: textH.redo, has: true }
    : markerH.value
      ? { undo: markerH.undo, redo: markerH.redo, has: true }
      : { undo: () => {}, redo: () => {}, has: false };
  const [map, setMap] = useState<mapboxgl.Map | null>(null);
  // Mapbox Draw (line/polygon drawing + vertex editing).
  // Shared with the draw hook (modechange) and the click handlers.
  const drawingRef = useRef(false); // true while a draw/edit mode is active
  const [styleVersion, setStyleVersion] = useState(0); // bumps on each style.load

  // Style currently applied to the map, to avoid redundant setStyle calls.
  const styleRef = useRef<string>("");

  const workspace = useStore(selectActiveWorkspace);
  const workspaces = useStore((s) => s.workspaces);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const addFeature = useStore((s) => s.addFeature);
  const updateFeature = useStore((s) => s.updateFeature);
  const removeFeature = useStore((s) => s.removeFeature);
  const upsertShape = useStore((s) => s.upsertShape);

  // Commit the marker draft at the current map center with its note/icon/colour.
  function commitMarker() {
    if (!markerDraft) return;
    const m = mapRef.current;
    if (m) {
      const c = m.getCenter();
      addFeature([c.lng, c.lat], "marker", markerDraft.title.trim(), {
        color: markerDraft.color,
        icon: markerDraft.icon,
      });
    }
    markerH.close();
  }
  const focus = useStore((s) => s.focus);
  const fitNonce = useStore((s) => s.fitNonce);
  const layout = useStore((s) => s.layout);

  const desiredStyle = styleUrl(workspace ? workspace.style : DEFAULT_STYLE);

  // Keep current values in refs so handlers attached once stay up to date.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  // Mapbox Draw (line/polygon creation + vertex editing).
  const { drawMode, hasSelection, startLine, startPolygon, deleteSelected, stopDrawing } =
    useDrawShapes(
    map,
    activeWorkspaceId,
    styleVersion,
    loadedRef,
    drawingRef,
    upsertShape,
    removeFeature,
  );

  // Rebuild both sources. In "Everything" the features of ALL workspaces are
  // aggregated; otherwise just the active workspace's.
  function refreshData() {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const markers: { feature: Feature; color: string; icon: string }[] = [];
    const clusteredMarkers: { feature: Feature; color: string; icon: string }[] = [];
    const texts: { feature: Feature; color: string }[] = [];
    displayedWorkspaces().forEach((ws) => {
      const glyph = markerGlyph(ws.marker);
      ws.layers.forEach((lyr) => {
        if (!lyr.visible) return;
        lyr.features.forEach((feature) => {
          if (feature.kind === "text") {
            texts.push({ feature, color: lyr.color });
          } else if (feature.kind === "marker") {
            // Per-marker icon/colour override the workspace defaults if set.
            const p = feature.properties;
            const mGlyph = typeof p.icon === "string" && p.icon ? markerGlyph(p.icon) : glyph;
            const mColor = typeof p.color === "string" && p.color ? p.color : lyr.color;
            const icon = ensureMarkerImage(map, mGlyph, mColor);
            // Route each marker into exactly one source: clustered layers cluster
            // the point, otherwise it renders as a plain (always-visible) icon.
            if (lyr.cluster !== false) {
              clusteredMarkers.push({ feature, color: mColor, icon });
            } else {
              markers.push({ feature, color: mColor, icon });
            }
          }
          // line/polygon are rendered/edited by Mapbox Draw, not these sources.
        });
      });
    });
    (map.getSource("markers") as mapboxgl.GeoJSONSource | undefined)?.setData(
      toGeoJSON(markers),
    );
    (map.getSource("clustered-markers") as mapboxgl.GeoJSONSource | undefined)?.setData(
      toGeoJSON(clusteredMarkers),
    );
    (map.getSource("texts") as mapboxgl.GeoJSONSource | undefined)?.setData(
      toGeoJSON(texts),
    );
  }

  // Initialize the map — once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !TOKEN) return;
    mapboxgl.accessToken = TOKEN;

    styleRef.current = desiredStyle;
    // Restore the last camera position/zoom remembered across reloads.
    const view = loadView();
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: desiredStyle,
      center: view.center,
      zoom: view.zoom,
    });
    if (import.meta.env.DEV) {
      (window as unknown as { __glopeMap?: mapboxgl.Map }).__glopeMap = map;
    }
    mapRef.current = map;
    setMap(map); // expose to the custom compass

    // Offset the optical center for the overlaid sidebar, then re-anchor the
    // saved center so it stays put (no drift across reloads).
    map.once("load", () => {
      map.setPadding({ top: 0, right: 0, bottom: 0, left: leftPad(layout) });
      map.setCenter(view.center);
    });

    // Remember camera position/zoom after every move (pan, zoom, fly).
    map.on("moveend", () => {
      const c = map.getCenter();
      saveView({ center: [c.lng, c.lat], zoom: map.getZoom() });
    });

    // Runs on the first style load AND after every setStyle (basemap/theme change).
    map.on("style.load", () => {
      addBaseLayers(map, isDarkStyle(workspaceRef.current?.style ?? DEFAULT_STYLE));
      loadedRef.current = true;
      refreshData();
      setStyleVersion((v) => v + 1); // re-apply overlays (rain) after the layer exists
    });

    // Click: open the inline editor for text labels. Marker details are hover-only.
    map.on("click", (e) => {
      if (markerDraftRef.current) return; // pin is centered; clicks do nothing
      if (editingTextRef.current || drawingRef.current) return; // ignore while editing/drawing
      const hits = map.queryRenderedFeatures(e.point, {
        layers: ["text-labels"],
      });
      const hit = hits[0];
      const id = hit?.properties?.id as string | undefined;
      if (hit && hit.properties?.kind === "text") {
        const p = hit.properties;
        const coords = (hit.geometry as GeoJSON.Point).coordinates as [number, number];
        openTextEditRef.current({
          id: id,
          lngLat: coords,
          text: typeof p.title === "string" ? p.title : "",
          size: typeof p.size === "number" ? p.size : 16,
          rotation: typeof p.rotation === "number" ? p.rotation : 0,
          color: typeof p.color === "string" ? p.color : "#ffffff",
          bold: p.bold === true || p.bold === "true",
          zoomScale: p.zoomScale === true || p.zoomScale === "true",
          anchorZoom: typeof p.anchorZoom === "number" ? p.anchorZoom : map.getZoom(),
        });
        return;
      }
    });

    // Pointer cursor when hovering a feature.
    [
      "markers",
      "marker-labels",
      "clustered-markers",
      "clustered-marker-labels",
      "text-labels",
    ].forEach((id) => {
      map.on("mouseenter", id, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", id, () => (map.getCanvas().style.cursor = ""));
    });
    map.on("mouseenter", "marker-clusters", () => (map.getCanvas().style.cursor = "pointer"));
    map.on("mouseleave", "marker-clusters", () => (map.getCanvas().style.cursor = ""));
    map.on("click", "marker-clusters", async (e) => {
      const feature = e.features?.[0];
      const clusterId = feature?.properties?.cluster_id as number | undefined;
      const coordinates = (feature?.geometry as GeoJSON.Point | undefined)?.coordinates as
        | [number, number]
        | undefined;
      const source = map.getSource("clustered-markers") as
        | (mapboxgl.GeoJSONSource & {
            getClusterExpansionZoom?: (clusterId: number) => Promise<number>;
          })
        | undefined;
      if (clusterId === undefined || !coordinates || !source?.getClusterExpansionZoom) return;
      const zoom = await source.getClusterExpansionZoom(clusterId);
      map.easeTo({ center: coordinates, zoom, duration: 450 });
    });

    attachBaseLayerHoverPopups(
      map,
      isDarkStyle(workspaceRef.current?.style ?? DEFAULT_STYLE),
    );

    const userFeaturePopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "plane-popup",
    });
    const hideUserFeaturePopup = () => {
      userFeaturePopup.remove();
    };
    const showUserFeaturePopup = (e: mapboxgl.MapLayerMouseEvent) => {
      if (markerDraftRef.current || editingTextRef.current || drawingRef.current) {
        hideUserFeaturePopup();
        return;
      }
      const feature = e.features?.[0];
      if (!feature) {
        hideUserFeaturePopup();
        return;
      }
      const p = feature.properties as { title?: string; kind?: string; text?: string };
      const detail = typeof p.text === "string" && p.text.trim() ? p.text.trim() : "";
      const title = typeof p.title === "string" && p.title.trim() ? p.title.trim() : "Untitled";
      const kind = p.kind === "text" ? "Text" : "Marker";
      map.getCanvas().style.cursor = "pointer";
      userFeaturePopup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="pp-call">${escapeHtml(title)}</div>` +
            (detail ? `<div class="pp-row">${escapeHtml(detail)}</div>` : "") +
            `<div class="pp-row">${kind}</div>`,
        )
        .addTo(map);
    };
    ["markers", "marker-labels", "clustered-markers", "clustered-marker-labels", "text-labels"].forEach((id) => {
      map.on("mousemove", id, showUserFeaturePopup);
      map.on("mouseleave", id, hideUserFeaturePopup);
    });
    map.on("mouseout", hideUserFeaturePopup);

    // Close the feature popup when the user pans/zooms the map.
    const dismiss = () => {
      hideUserFeaturePopup();
    };
    map.on("dragstart", dismiss);
    map.on("zoomstart", dismiss);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch basemap/theme when the active workspace's style changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleRef.current === desiredStyle) return;
    styleRef.current = desiredStyle;
    loadedRef.current = false; // until style.load re-adds our layers
    map.setStyle(desiredStyle);
  }, [desiredStyle]);

  // Refresh source data on any data change or active switch (covers "Everything",
  // where the active workspace object doesn't change as features are added).
  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaces, activeWorkspaceId]);

  // Frame all visible points currently displayed (active workspace, or all).
  function fitActive() {
    const map = mapRef.current;
    if (!map) return;
    const points: [number, number][] = [];
    displayedWorkspaces().forEach((ws) =>
      ws.layers.forEach((lyr) => {
        if (!lyr.visible) return;
        lyr.features.forEach((f) => points.push(f.lngLat));
      }),
    );
    if (points.length === 0) return;
    const bounds = points.reduce(
      (b, p) => b.extend(p),
      new mapboxgl.LngLatBounds(points[0], points[0]),
    );
    const pad = leftPad(useStore.getState().layout);
    // Inset by the sidebar on the left so points aren't framed under it.
    // Cap zoom so a single point (or tight cluster) doesn't zoom to the max.
    map.fitBounds(bounds, {
      padding: { top: 60, right: 60, bottom: 60, left: 60 + pad },
      maxZoom: 14,
      duration: 800,
    });
  }

  // Fit when the workspace actually CHANGES — not on the initial mount (so the
  // restored camera survives) and not on StrictMode's double-invoke.
  const prevWsIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevWsIdRef.current === null || prevWsIdRef.current === activeWorkspaceId) {
      prevWsIdRef.current = activeWorkspaceId;
      return;
    }
    prevWsIdRef.current = activeWorkspaceId;
    fitActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  // Fit on explicit request (e.g. clicking the already-active workspace).
  // Compare the previous nonce (not a one-shot flag) so StrictMode's double
  // invoke on mount can't fire an unwanted fit that overwrites the saved camera.
  const prevFitNonceRef = useRef(fitNonce);
  useEffect(() => {
    if (prevFitNonceRef.current === fitNonce) return;
    prevFitNonceRef.current = fitNonce;
    fitActive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitNonce]);

  // On layout change: animate the map padding so the optical center follows
  // the sidebar appearing/disappearing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      padding: { top: 0, right: 0, bottom: 0, left: leftPad(layout) },
      duration: 300,
    });
  }, [layout]);

  // Live aircraft + ships + lightning (extracted hooks).
  useAircraftLayer(mapRef, activeWorkspaceId);
  useShipsLayer(mapRef, activeWorkspaceId);
  useLightningLayer(mapRef, activeWorkspaceId);
  useMeteoritesLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useFiresLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useCablesLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useCovidLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useNuclearLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useCrashesLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useWrecksLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useTectonicsLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useUnescoLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useAirLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useNukeTestsLayer(mapRef, activeWorkspaceId, styleVersion, loadedRef);
  useCo2Layer(mapRef, activeWorkspaceId, styleVersion, loadedRef);

  // Live ISS position + orbit ring (wheretheiss.at).
  useIssLayer(mapRef, activeWorkspaceId);

  // Weather radar layer + frames (RainViewer).
  const { frames: rainFrames, index: rainIndex, setIndex: setRainIndex } = useRainLayer(
    mapRef,
    activeWorkspaceId,
    styleVersion,
    loadedRef,
  );

  // Fly to a feature requested from the list (nonce re-triggers on repeat clicks).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: focus.lngLat, zoom: Math.max(map.getZoom(), 14), duration: 800 });
  }, [focus]);

  // Undo/redo (⌘/Ctrl+Z, ⇧ for redo) — only while an item editor is open, and
  // scoped to that editor's own history (no global document undo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== "z" && e.key !== "Z") || !(e.metaKey || e.ctrlKey)) return;
      if (!editorKeysRef.current.has) return;
      e.preventDefault();
      if (e.shiftKey) editorKeysRef.current.redo();
      else editorKeysRef.current.undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // While editing an existing label inline, hide its on-map copy (the overlay
  // input renders the live version in its place).
  useEffect(() => {
    const m = mapRef.current;
    if (!m || !m.getLayer("text-labels")) return;
    const editId = textDraft?.id;
    m.setFilter("text-labels", editId ? ["!=", ["get", "id"], editId] : null);
  }, [textDraft, styleVersion]);

  // Commit the inline text draft: create, update, or delete (when emptied).
  function commitText() {
    if (!textDraft) return;
    const text = textDraft.text.trim();
    const props = {
      size: textDraft.size,
      rotation: textDraft.rotation,
      color: textDraft.color,
      bold: textDraft.bold,
      zoomScale: textDraft.zoomScale,
      anchorZoom: textDraft.anchorZoom,
    };
    if (!text) {
      if (textDraft.id) removeFeature(textDraft.id);
    } else if (textDraft.id) {
      updateFeature(textDraft.id, { title: text, properties: props });
    } else {
      // New label commits at the current map center (it was pinned there).
      const c = mapRef.current?.getCenter();
      const lngLat: [number, number] = c ? [c.lng, c.lat] : textDraft.lngLat;
      addFeature(lngLat, "text", text, props);
    }
    textH.close();
  }

  if (!TOKEN) {
    return (
      <div className="map-error">
        <div>
          <h2>No Mapbox token</h2>
          <p>
            Add your Mapbox token in the popup (or the <code>🔑</code> button,
            top-left). It's stored in this browser only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="map-wrap"
      style={{ ["--left-inset" as string]: `${leftPad(layout)}px` }}
    >
      <div ref={containerRef} className="map-container" />
      <MapCompass map={map} />
      <MapStyleSwitcher />
      {textDraft && map && (
        <TextEditor
          map={map}
          draft={textDraft}
          onChange={textH.change}
          onCommit={commitText}
          onCancel={() => textH.close()}
          onDelete={() => {
            if (textDraft.id) removeFeature(textDraft.id);
            textH.close();
          }}
        />
      )}
      {activeWorkspaceId === RAIN_ID && rainFrames.length > 0 && (
        <RainTimeline frames={rainFrames} index={rainIndex} onIndex={setRainIndex} />
      )}
      {markerDraft && map && (
        <>
          <CenterPin map={map} icon={markerDraft.icon} color={markerDraft.color} />
          <MarkerForm
            draft={markerDraft}
            onChange={markerH.change}
            onDone={commitMarker}
            onCancel={() => markerH.close()}
          />
        </>
      )}
      <DrawTools
        active={markerDraft ? "marker" : textDraft ? "text" : drawMode}
        canDelete={hasSelection}
        onMarker={() => {
          stopDrawing();
          textH.close();
          if (markerDraft) markerH.close();
          else
            markerH.open({
              title: "",
              color: workspaceRef.current?.layers?.[0]?.color ?? "#845ef7",
              icon: "pin",
            });
        }}
        onText={() => {
          stopDrawing();
          markerH.close();
          if (textDraft) {
            textH.close();
          } else {
            const c = mapRef.current?.getCenter();
            const isDark = document.documentElement.dataset.theme === "dark";
            textH.open({
              lngLat: c ? [c.lng, c.lat] : [0, 0],
              text: "",
              size: 16,
              rotation: 0,
              color: isDark ? "#ffffff" : "#212529",
              bold: false,
              zoomScale: false,
              anchorZoom: mapRef.current?.getZoom() ?? 0,
            });
          }
        }}
        onLine={() => {
          markerH.close();
          textH.close();
          startLine();
        }}
        onPolygon={() => {
          markerH.close();
          textH.close();
          startPolygon();
        }}
        onDelete={deleteSelected}
      />
      <UndoRedo
        editing={textDraft !== null || markerDraft !== null}
        canUndo={textDraft ? textH.canUndo : markerDraft ? markerH.canUndo : false}
        canRedo={textDraft ? textH.canRedo : markerDraft ? markerH.canRedo : false}
        onUndo={() => (textDraft ? textH.undo() : markerH.undo())}
        onRedo={() => (textDraft ? textH.redo() : markerH.redo())}
      />
    </div>
  );
}

// Inline text editor: an input anchored to a map point (so you type the label
// right where it will sit) plus a fixed toolbar for size / rotation / colour.
function TextEditor({
  map,
  draft,
  onChange,
  onCommit,
  onCancel,
  onDelete,
}: {
  map: mapboxgl.Map;
  draft: TextDraft;
  onChange: (patch: Partial<TextDraft>) => void;
  onCommit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // A new label is pinned to the screen center (pan the map to position it); an
  // existing one stays anchored at its own point while you re-type/restyle.
  const isNew = draft.id === undefined;
  const anchor = () => (isNew ? map.getCenter() : draft.lngLat);
  const [pos, setPos] = useState(() => map.project(anchor()));

  // Keep the input glued to its anchor (screen center for new) as the map moves.
  useEffect(() => {
    const update = () => setPos(map.project(isNew ? map.getCenter() : draft.lngLat));
    update();
    map.on("move", update);
    return () => {
      map.off("move", update);
    };
  }, [map, isNew, draft.lngLat]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Stops a control from stealing focus from the input on click.
  const keepFocus = (e: ReactMouseEvent) => e.preventDefault();

  // Drag the rotation handle around the anchor — its angle sets the text rotation.
  function startRotate(e: ReactPointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const container = map.getContainer();
    const bearing = map.getBearing();
    const move = (ev: globalThis.PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const a = map.project(anchor());
      const dx = ev.clientX - rect.left - a.x;
      const dy = ev.clientY - rect.top - a.y;
      let r = (Math.atan2(-dx, dy) * 180) / Math.PI + bearing;
      r = (((r + 180) % 360) + 360) % 360 - 180; // normalize to [-180, 180)
      onChange({ rotation: Math.round(r) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Effective on-screen size (matches the map): when pinned to zoom the label
  // scales by 2^(zoom − anchorZoom) so the preview tracks what the map renders.
  const effSize = draft.zoomScale
    ? draft.size * Math.min(1, Math.pow(2, map.getZoom() - draft.anchorZoom))
    : draft.size;

  // Rotation handle sits on a radius below the text, orbiting as rotation changes.
  const visAngle = ((draft.rotation - map.getBearing()) * Math.PI) / 180;
  const radius = effSize / 2 + 30;
  const rotPos = {
    x: pos.x - radius * Math.sin(visAngle),
    y: pos.y + radius * Math.cos(visAngle),
  };

  return (
    <>
      <input
        ref={inputRef}
        className="map-text-input"
        value={draft.text}
        placeholder="Text…"
        onChange={(e) => onChange({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        style={{
          left: pos.x,
          top: pos.y,
          transform: `translate(-50%, -50%) rotate(${draft.rotation - map.getBearing()}deg)`,
          fontSize: Math.max(1, effSize),
          color: draft.color,
          fontWeight: draft.bold ? 700 : 500,
          width: `${Math.max(2, draft.text.length + 1)}ch`,
          caretColor: draft.color,
        }}
      />
      <div
        className="map-text-tether"
        style={{
          left: pos.x,
          top: pos.y,
          height: radius,
          transform: `translateX(-50%) rotate(${draft.rotation - map.getBearing()}deg)`,
        }}
      />
      <button
        className="map-text-rot"
        style={{ left: rotPos.x, top: rotPos.y }}
        onPointerDown={startRotate}
        onMouseDown={keepFocus}
        title="Rotate"
      >
        <RotateCw size={12} />
      </button>
      <div className="text-toolbar">
        <button
          className="tt-btn tt-circle"
          onMouseDown={keepFocus}
          onClick={onCancel}
          title="Cancel"
        >
          <X size={14} />
        </button>
        <span className="tt-group" title="Size">
          <Type size={14} />
          <input
            type="range"
            min={10}
            max={80}
            value={draft.size}
            onChange={(e) => onChange({ size: Number(e.target.value) })}
          />
        </span>
        <button
          className={"tt-btn" + (draft.bold ? " active" : "")}
          onMouseDown={keepFocus}
          onClick={() => onChange({ bold: !draft.bold })}
          title="Bold"
        >
          <Bold size={14} />
        </button>
        <button
          className={"tt-btn" + (draft.zoomScale ? " active" : "")}
          onMouseDown={keepFocus}
          onClick={() =>
            onChange(
              draft.zoomScale
                ? { zoomScale: false }
                : { zoomScale: true, anchorZoom: map.getZoom() },
            )
          }
          title="Pin size to zoom (only visible when zoomed in)"
        >
          <ScanSearch size={14} />
        </button>
        <span className="tt-swatches">
          {TEXT_COLORS.map((c) => (
            <button
              key={c}
              className={"tt-sw" + (c === draft.color ? " active" : "")}
              style={{ background: c }}
              onMouseDown={keepFocus}
              onClick={() => onChange({ color: c })}
            />
          ))}
        </span>
        {draft.id && (
          <button className="tt-btn" onMouseDown={keepFocus} onClick={onDelete} title="Delete">
            <Trash2 size={14} />
          </button>
        )}
        <button
          className="tt-btn primary tt-circle"
          onMouseDown={keepFocus}
          onClick={onCommit}
          title="Done"
        >
          <Check size={14} />
        </button>
      </div>
    </>
  );
}
