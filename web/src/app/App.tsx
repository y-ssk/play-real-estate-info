import { useCallback, useMemo, useState } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { CHOROPLETH_FILL_LAYER_ID, ChoroplethLayer } from "../features/choropleth/ChoroplethLayer";
import { ChoroplethLegend } from "../features/choropleth/ChoroplethLegend";
import { MetricToggle } from "../features/choropleth/MetricToggle";
import { DEFAULT_METRIC } from "../features/choropleth/metrics";
import { useChoroplethGeometry } from "../features/choropleth/useChoroplethGeometry";
import { FilterPanel } from "../features/filters/FilterPanel";
import { useAllMetricValues } from "../features/filters/useAllMetricValues";
import { KartePanel } from "../features/karte/KartePanel";
import { MapView } from "../features/map/MapView";
import { useFilterStore } from "../lib/filterStore";
import { buildUnitRows, filterUnitRows } from "../lib/filtering";
import { useSelectionStore } from "../lib/selection";

/** クリックで選べる単位の種別（MVP＝市区町村・ADR-0018 識別子の継ぎ目）。 */
const CLICK_UNIT_KIND = "municipality";

/**
 * App は全体レイアウトの最上位（app 層・frontend-conventions §1）。
 * 機能どうしは直接依存させず、app 層が地図（map）の上に色分け（choropleth）・カルテ（karte）・絞り込み
 * （filters）を重ねる合成点。面塗りは地図レイヤー（MapView の子）、凡例・指標トグル・カルテ/絞り込みパネルは
 * 地図上の DOM オーバーレイ（兄弟）。
 *
 * 選択中の指標は app 層の UI 状態として持つ（純ローカル＝useState・frontend-conventions §3）。
 * 選択中の単位は共有 UI 状態（Zustand・ADR-0018）＝map（クリックで選ぶ）と karte（カルテを出す）で共有する。
 * 絞り込み条件・並べ替えは共有 UI 状態（filter store・Zustand・ADR-0012/0018）＝panel（条件入力）・
 * list（並べ替え）・map（該当ハイライト）で共有する。
 *
 * 絞り込みの素材＝単位行（geometry の code/name × 全指標値）を App が組み（ADR-0012・クライアント側で
 * 突き合わせ＝MVP は 69 市区町村ゆえ素直に・ADR-0015/0017）、該当コード集合を ChoroplethLayer へ渡して
 * 地図ハイライトする（真実は filter store・地図は描画の鏡・§3）。
 */
export function App() {
  const [metric, setMetric] = useState<string>(DEFAULT_METRIC);
  const [filterOpen, setFilterOpen] = useState<boolean>(false);
  const select = useSelectionStore((s) => s.select);

  const { data: geometry } = useChoroplethGeometry();
  const { byMetric } = useAllMetricValues();
  const conditions = useFilterStore((s) => s.conditions);

  // 単位行（geometry × 全指標）を組む。geometry が母体（描ける区だけ一覧/絞り込みに乗せる・lib/filtering）。
  const rows = useMemo(() => {
    if (!geometry) {
      return [];
    }
    const units = geometry.features.map((f) => ({
      code: (f.id as string | undefined) ?? f.properties.code,
      name: f.properties.name,
    }));
    return buildUnitRows(units, byMetric);
  }, [geometry, byMetric]);

  // 絞り込みが効いているか（条件が1つ以上ある）。効いている間だけ地図を該当/非該当でハイライトする。
  const filterActive = Object.keys(conditions).length > 0;

  // 該当コード集合（絞り込み中のみ算出）。地図ハイライト（matched）と一覧で同じ純関数を使う＝結果が一致。
  const matchedCodes = useMemo(() => {
    if (!filterActive) {
      return undefined;
    }
    return new Set(filterUnitRows(rows, conditions).map((r) => r.code));
  }, [rows, conditions, filterActive]);

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
        <ChoroplethLayer metric={metric} matchedCodes={matchedCodes} filterActive={filterActive} />
      </MapView>
      <MetricToggle metric={metric} onChange={setMetric} />
      {/* 絞り込みパネルの開閉トグル（③開閉式・DESIGN §2）。閉じている間は地図全面。 */}
      {!filterOpen && (
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          style={OPEN_FILTER_STYLE}
          aria-label="絞り込みを開く"
        >
          絞り込み
        </button>
      )}
      <FilterPanel rows={rows} open={filterOpen} onClose={() => setFilterOpen(false)} />
      <ChoroplethLegend metric={metric} />
      <KartePanel />
    </div>
  );
}

/** 絞り込みを開くボタン（地図左上・指標トグルの下）。色はスレート系（差し色 hex 未確定・MetricToggle と同方針）。 */
const OPEN_FILTER_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 80,
  left: 8,
  padding: "4px 12px",
  borderRadius: 4,
  border: "1px solid #cbd5e1",
  background: "rgba(255,255,255,0.9)",
  color: "#334155",
  font: "600 12px/1.4 system-ui, sans-serif",
  cursor: "pointer",
  zIndex: 1,
};
