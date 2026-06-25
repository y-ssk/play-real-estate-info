import { Layer, type LineLayer, Source } from "react-map-gl/maplibre";
import { CHOROPLETH_OUTLINE_COLOR, CHOROPLETH_OUTLINE_WIDTH } from "../../styles/mapTokens";
import { useChoroplethGeometry } from "./useChoroplethGeometry";

/** 区の輪郭線レイヤーの id（後続の塗りレイヤー追加時に重ね順の基準にする）。 */
const OUTLINE_LAYER_ID = "choropleth-outline";

/**
 * 輪郭線のスタイル。今回は指標がないため塗り（fill）は作らず line のみ（タスク指示・ADR-0016 (ii)）。
 * 色・太さは生値直書きせず用途トークン経由（DESIGN §4）。
 */
const outlineLayer: LineLayer = {
  id: OUTLINE_LAYER_ID,
  type: "line",
  // Source の id はコンポーネントの <Source id> と一致させる必要がある（MapLibre のレイヤー結線）。
  source: "choropleth",
  paint: {
    "line-color": CHOROPLETH_OUTLINE_COLOR,
    "line-width": CHOROPLETH_OUTLINE_WIDTH,
  },
};

/**
 * ChoroplethLayer は色分けの境界ジオメトリを GSI 下地の上に輪郭線で描く（ADR-0016/0019）。
 *
 * 形のみを line で描画する（塗りは指標導入時に setFeatureState で別途）。MapView の子として
 * 置き、データ取得前は Source を出さない＝白い基図のまま壊さない（タスクのローディング方針）。
 * 取得失敗時も何も描かず基図を保つ（周辺は薄く＝本格的な欠損UIは別バックログ）。
 */
export function ChoroplethLayer() {
  const { data } = useChoroplethGeometry();

  // 取得前・失敗時は Source を出さない（data が無い間は描画しない＝基図のみで壊れない）。
  if (data === undefined) {
    return null;
  }

  // feature.id は API 付与済み（5桁コード）ゆえ promoteId は不要（ADR-0016）。
  return (
    <Source id="choropleth" type="geojson" data={data}>
      <Layer {...outlineLayer} />
    </Source>
  );
}
