import { WB_INDICATORS, bucketLabel, type WbKey, type ChoroLegend } from "./useWorldData";

// Country-choropleth control: pick a World Bank indicator + color legend.
export function WorldDataPanel({
  indicator,
  onIndicator,
  legend,
}: {
  indicator: WbKey;
  onIndicator: (k: WbKey) => void;
  legend: ChoroLegend | null;
}) {
  return (
    <div className="world-panel">
      <div className="wp-tabs">
        {(Object.keys(WB_INDICATORS) as WbKey[]).map((k) => (
          <button
            key={k}
            className={"wp-tab" + (k === indicator ? " active" : "")}
            onClick={() => onIndicator(k)}
          >
            {WB_INDICATORS[k].short}
          </button>
        ))}
      </div>
      {legend && (
        <div className="wp-legend">
          <div className="wp-unit">{legend.unit}</div>
          {legend.colors.map((c, i) => (
            <div key={i} className="wp-row">
              <span className="wp-sw" style={{ background: c }} />
              <span className="wp-lbl">{bucketLabel(legend, i)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
