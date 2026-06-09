import { useEffect } from "react";
import { useStore } from "./store";
import { isDarkStyle, DEFAULT_STYLE } from "./mapStyles";
import { MapView } from "./components/MapView";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { BrandBar } from "./components/BrandBar";

export function App() {
  const workspaces = useStore((s) => s.workspaces);
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);

  // The UI theme follows the active map's basemap: dark map → dark UI.
  const styleId =
    workspaces.find((w) => w.id === activeWorkspaceId)?.style ?? DEFAULT_STYLE;
  const theme = isDarkStyle(styleId) ? "dark" : "light";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  // Both panels stay mounted; CSS shows/hides them so the swap can animate.
  return (
    <div className="app">
      <Sidebar />
      <MapView />
      <TopBar />
      <BrandBar />
    </div>
  );
}
