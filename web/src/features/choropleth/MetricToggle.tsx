import { CHOROPLETH_METRICS } from "./metrics";

/**
 * MetricToggle は面塗りの指標を切り替える最小の操作（F2 の芽・タスク 2b）。
 *
 * 過剰なUIにしない＝select 1つ（指標が2件以上のときだけ意味を持つ）。選んだ key を app 層へ返し、
 * app が面塗り（ChoroplethLayer）と凡例（ChoroplethLegend）へ同じ metric を流す＝表示が必ずそろう。
 * 地図左上に薄く重ねる（凡例＝右下と被らない・操作を妨げない）。
 *
 * @param metric 現在選択中の指標キー。
 * @param onChange 選択変更時に新しいキーを渡すコールバック。
 */
export function MetricToggle({
  metric,
  onChange,
}: {
  metric: string;
  onChange: (metric: string) => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        padding: "6px 8px",
        borderRadius: 4,
        background: "rgba(255,255,255,0.9)",
        font: "12px/1.4 system-ui, sans-serif",
        color: "#334155",
        zIndex: 1,
      }}
    >
      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>指標</span>
        <select
          value={metric}
          onChange={(e) => onChange(e.target.value)}
          style={{ font: "inherit", color: "inherit" }}
        >
          {CHOROPLETH_METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.title}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
