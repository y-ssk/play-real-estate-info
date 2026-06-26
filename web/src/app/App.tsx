import { useState } from "react";
import { ChoroplethLayer } from "../features/choropleth/ChoroplethLayer";
import { ChoroplethLegend } from "../features/choropleth/ChoroplethLegend";
import { MetricToggle } from "../features/choropleth/MetricToggle";
import { DEFAULT_METRIC } from "../features/choropleth/metrics";
import { MapView } from "../features/map/MapView";

/**
 * App は全体レイアウトの最上位（app 層・frontend-conventions §1）。
 * 機能どうしは直接依存させず、app 層が地図（map）の上に色分け（choropleth）を重ねる合成点。
 * 面塗りは地図レイヤー（MapView の子）、凡例・指標トグルは地図上の DOM オーバーレイ（兄弟）。
 *
 * 指標切替（F2 の芽・タスク 2b）：選択中の metric を app が持ち、面塗りと凡例へ同じ値を流す
 * （表示が必ずそろう・取り違え防止）。パネル/フィルタ等は後続スライスで重ねる（DESIGN §2）。
 */
export function App() {
  const [metric, setMetric] = useState<string>(DEFAULT_METRIC);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapView>
        <ChoroplethLayer metric={metric} />
      </MapView>
      <MetricToggle metric={metric} onChange={setMetric} />
      <ChoroplethLegend metric={metric} />
    </div>
  );
}
