import { useState } from "react";
import { ChoroplethLayer } from "../features/choropleth/ChoroplethLayer";
import { ChoroplethLegend } from "../features/choropleth/ChoroplethLegend";
import { MetricToggle } from "../features/choropleth/MetricToggle";
import { DEFAULT_METRIC } from "../features/choropleth/metrics";
import { MapView } from "../features/map/MapView";

/**
 * App は全体レイアウトの最上位（app 層・frontend-conventions §1）。
 * 機能どうしは直接依存させず、app 層が地図（map）の上に色分け（choropleth）を重ねる合成点。
 * 面塗りは地図レイヤー（MapView の子）、凡例・指標トグルは地図上の DOM オーバーレイ（兄弟）として重ねる。
 *
 * 選択中の指標は app 層の UI 状態として持つ（純ローカル＝useState・frontend-conventions §3。パネル/絞り込み等の
 * 横断 UI 状態が増える段で Zustand へ昇格する＝docs/99 トリガー）。トグル・面塗り・凡例へ同じ metric を渡し、
 * 三者の表示（色分け・凡例・選択）を1つの真実に揃える。
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
