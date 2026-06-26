import { useEffect, useMemo } from "react";
import { type FillLayer, Layer, type LineLayer, Source, useMap } from "react-map-gl/maplibre";
import {
  CHOROPLETH_FILL_OPACITY_EXPR,
  CHOROPLETH_OUTLINE_COLOR,
  CHOROPLETH_OUTLINE_WIDTH,
  choroplethFillColor,
} from "../../styles/mapTokens";
import { useChoroplethGeometry } from "./useChoroplethGeometry";
import { useChoroplethValues } from "./useChoroplethValues";

/** 色分け source の id（geometry と values を結ぶ feature-state の対象）。 */
const SOURCE_ID = "choropleth";
/** 区の輪郭線レイヤーの id。 */
const OUTLINE_LAYER_ID = "choropleth-outline";
/** 面塗りレイヤーの id（輪郭線より下＝線を塗りで隠さない）。 */
const FILL_LAYER_ID = "choropleth-fill";

/** 実証スライス（2a）の対象指標。面積（取得・鍵不要・既存 geom から算出）。 */
const METRIC = "area_km2";

/**
 * 輪郭線のスタイル。色・太さは生値直書きせず用途トークン経由（DESIGN §4）。
 * 面塗りを足した後も輪郭線は残す（区界を読ませる線・タスク死守）。
 */
const outlineLayer: LineLayer = {
  id: OUTLINE_LAYER_ID,
  type: "line",
  source: SOURCE_ID,
  paint: {
    "line-color": CHOROPLETH_OUTLINE_COLOR,
    "line-width": CHOROPLETH_OUTLINE_WIDTH,
  },
};

/**
 * 面塗りレイヤーのスタイルを値域から組む。
 *
 * fill-color＝feature-state の value を段階色へ（choroplethFillColor）。**データなしは色抜き**：
 * value（feature-state）が無い/null の feature は fill-opacity を 0 にし、基図をそのまま見せる
 * （ADR-0011 データなし3区別の「none/秘匿は塗らない」を視覚で担保）。値がある feature だけ不透明度を載せる。
 */
function buildFillLayer(min: number, max: number): FillLayer {
  return {
    id: FILL_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": choroplethFillColor(min, max),
      // データなしは色抜き（state 未設定/null は不透明度0）。式はトークンに集約（§4）。
      "fill-opacity": CHOROPLETH_FILL_OPACITY_EXPR,
    },
  };
}

/**
 * ChoroplethLayer は境界（形）に指標値を載せて面塗りする（ADR-0016 値とジオメトリの分離）。
 *
 * 形は geojson source、値は別経路で取得し setFeatureState で5桁コード結合する（状態の真実は値、
 * setFeatureState は描画の鏡・frontend-conventions §3）。**形と値が両方そろってから state を張る**
 * （順序：source 描画前に setFeatureState すると無視されるため、geometry 取得後に値を流す）。
 * データなし（status none/suppressed、value=null）は塗らない＝色抜き（ADR-0011）。
 */
export function ChoroplethLayer() {
  const { current: map } = useMap();
  const { data: geometry } = useChoroplethGeometry();
  const { data: values } = useChoroplethValues(METRIC);

  // 値域 [min,max]：present かつ value!=null（数値）の値だけから取る。
  // データなし/秘匿（null）と該当なし0 の扱い：0 は present の数値ゆえ値域に含む（最小が0になりうる）。
  const range = useMemo(() => {
    const nums = (values ?? [])
      .filter((v) => v.status === "present" && v.value !== null)
      .map((v) => v.value as number);
    if (nums.length === 0) {
      return null;
    }
    return { min: Math.min(...nums), max: Math.max(...nums) };
  }, [values]);

  // 形と値が両方そろってから feature-state を張る（順序：geometry source が描画済みであること）。
  // 値あり（present・数値）だけ value を載せ、データなし（none/suppressed・null）は state を張らない
  // ＝色抜き条件（fill-opacity の !=null）に乗る。指標切替時の取り違えを避けるため、毎回 removeFeatureState で
  // 一旦消してから張り直す（前指標の値が残らない）。
  useEffect(() => {
    if (!map || !geometry || !values) {
      return;
    }
    const m = map.getMap();
    // 前回分を消す（指標切替・再取得での持ち越し防止）。source 未読込時は no-op。
    m.removeFeatureState({ source: SOURCE_ID });
    for (const v of values) {
      if (v.status === "present" && v.value !== null) {
        // present フラグも張る＝色抜き判定（fill-opacity）に使う。値0（該当なし）も present=true で塗る。
        m.setFeatureState({ source: SOURCE_ID, id: v.code }, { value: v.value, present: true });
      }
    }
  }, [map, geometry, values]);

  // 取得前・失敗時は Source を出さない（基図のみで壊れない・タスクのローディング方針）。
  if (geometry === undefined) {
    return null;
  }

  // 値域が無い間（値未取得/全データなし）は面塗りを出さず輪郭線のみ＝形は先に見える。
  const fillLayer = range ? buildFillLayer(range.min, range.max) : null;

  return (
    <Source id={SOURCE_ID} type="geojson" data={geometry}>
      {/* 面塗り（下）→ 輪郭線（上）の順で重ね、塗りが線を隠さないようにする。 */}
      {fillLayer && <Layer {...fillLayer} />}
      <Layer {...outlineLayer} />
    </Source>
  );
}

export { METRIC as CHOROPLETH_METRIC };
