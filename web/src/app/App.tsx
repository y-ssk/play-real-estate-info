import { useCallback, useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { CHOROPLETH_FILL_LAYER_ID, ChoroplethLayer } from "../features/choropleth/ChoroplethLayer";
import { ChoroplethLegend } from "../features/choropleth/ChoroplethLegend";
import { MetricToggle } from "../features/choropleth/MetricToggle";
import { DEFAULT_METRIC } from "../features/choropleth/metrics";
import { KartePanel } from "../features/karte/KartePanel";
import { MapView } from "../features/map/MapView";
import { useSelectionStore } from "../lib/selection";

/** クリックで選べる単位の種別（MVP＝市区町村・ADR-0018 識別子の継ぎ目）。 */
const CLICK_UNIT_KIND = "municipality";

/**
 * App は全体レイアウトの最上位（app 層・frontend-conventions §1）。
 * 機能どうしは直接依存させず、app 層が地図（map）の上に色分け（choropleth）・カルテ（karte）を重ねる合成点。
 * 面塗りは地図レイヤー（MapView の子）、凡例・指標トグル・カルテパネルは地図上の DOM オーバーレイ（兄弟）。
 *
 * 選択中の指標は app 層の UI 状態として持つ（純ローカル＝useState・frontend-conventions §3）。
 * 選択中の単位は共有 UI 状態（Zustand・ADR-0018）＝map（クリックで選ぶ）と karte（カルテを出す）で共有する。
 * 地図クリックの結線：面塗り面（{@link CHOROPLETH_FILL_LAYER_ID}）に当たった feature の5桁コードを取り、
 * 選択単位 {unitKind, unitId} を立てる（ADR-0018 識別子）。
 */
export function App() {
  const [metric, setMetric] = useState<string>(DEFAULT_METRIC);
  const select = useSelectionStore((s) => s.select);

  // 地図クリック→選択：interactiveLayerIds で面塗り面だけが event.features に載る。
  // feature.id（geometry API が5桁コードを付与済み）を優先し、無ければ properties.code を見る
  // （promoteId は使わない・ChoroplethLayer の結合と同じ前提）。面以外（基図）クリックは features 空＝無視。
  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f) {
        return;
      }
      const code = typeof f.id === "string" ? f.id : (f.properties?.code as string | undefined);
      if (!code) {
        return;
      }
      select({ unitKind: CLICK_UNIT_KIND, unitId: code });
    },
    [select],
  );

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapView interactiveLayerIds={[CHOROPLETH_FILL_LAYER_ID]} onMapClick={handleMapClick}>
        <ChoroplethLayer metric={metric} />
      </MapView>
      <MetricToggle metric={metric} onChange={setMetric} />
      <ChoroplethLegend metric={metric} />
      <KartePanel />
    </div>
  );
}
