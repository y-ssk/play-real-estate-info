import { useCallback, useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { CHOROPLETH_FILL_LAYER_ID, ChoroplethLayer } from "../features/choropleth/ChoroplethLayer";
import { ChoroplethLegend } from "../features/choropleth/ChoroplethLegend";
import { MetricToggle } from "../features/choropleth/MetricToggle";
import { DEFAULT_METRIC } from "../features/choropleth/metrics";
import { FilterDrawerToggle, FilterPanel } from "../features/filters/FilterPanel";
import { useFilterMatch } from "../features/filters/useFilterMatch";
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
/** 面塗り面の feature から5桁コードを取り出す（feature.id 優先・無ければ properties.code）。クリック/ホバー共通。 */
function featureCode(
  f: { id?: string | number; properties?: Record<string, unknown> | null } | undefined,
): string | null {
  if (!f) {
    return null;
  }
  return typeof f.id === "string" ? f.id : ((f.properties?.code as string | undefined) ?? null);
}

export function App() {
  const [metric, setMetric] = useState<string>(DEFAULT_METRIC);
  const select = useSelectionStore((s) => s.select);
  // ホバー中の単位コード（一時の合図・純ローカル＝useState）。react-map-gl の onMouseMove で取り、
  // ChoroplethLayer が feature-state `hover` に張り替える（選択と同じく「真実は外・地図は描画の鏡」）。
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // 絞り込み（④・ADR-0028）：条件→該当コード集合と、スライダー両端の値域。該当集合は地図ハイライトへ
  // （値の色とは別チャネル・ChoroplethLayer の matchedCodes）。null＝非作動＝普通の色分け地図。
  const { matchedCodes, rangesByMetric } = useFilterMatch();

  // 地図クリック→選択：interactiveLayerIds で面塗り面だけが event.features に載る。
  // feature.id（geometry API が5桁コードを付与済み）を優先し、無ければ properties.code を見る
  // （promoteId は使わない・ChoroplethLayer の結合と同じ前提）。面以外（基図）クリックは features 空＝無視。
  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const code = featureCode(e.features?.[0]);
      if (code) {
        select({ unitKind: CLICK_UNIT_KIND, unitId: code });
      }
    },
    [select],
  );

  // ホバー：クリックと同じ react-map-gl のイベント経路で面塗り面の feature を取る（生の map.on は配下で
  // 発火せず層4 で無反応だった）。乗っている区のコードを hoveredId に。区外（features 空）は null＝強調を外す。
  const handleMapMouseMove = useCallback((e: MapLayerMouseEvent) => {
    setHoveredId(featureCode(e.features?.[0]));
  }, []);
  const handleMapMouseLeave = useCallback(() => setHoveredId(null), []);

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapView
        interactiveLayerIds={[CHOROPLETH_FILL_LAYER_ID]}
        onMapClick={handleMapClick}
        onMapMouseMove={handleMapMouseMove}
        onMapMouseLeave={handleMapMouseLeave}
      >
        <ChoroplethLayer metric={metric} hoveredId={hoveredId} matchedCodes={matchedCodes} />
      </MapView>
      <MetricToggle metric={metric} onChange={setMetric} />
      <ChoroplethLegend metric={metric} />
      {/* 絞り込みは左端の可動ドロワー（ADR-0029）：閉時はトグルだけ（地図全面）、開くと左からスライドして
          パネルが出る。値域が無い間はどちらも出ない（FilterDrawerToggle 自身は常駐だが、地図に値が無い
          初期でも開けると空パネルになるため、値域が揃ってから出す＝トグルもパネルと同じ条件で見せる）。 */}
      {Object.keys(rangesByMetric).length > 0 && <FilterDrawerToggle />}
      <FilterPanel rangesByMetric={rangesByMetric} />
      <KartePanel />
    </div>
  );
}
