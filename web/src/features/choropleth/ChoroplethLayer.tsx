import { useEffect, useMemo } from "react";
import { type FillLayer, Layer, type LineLayer, Source, useMap } from "react-map-gl/maplibre";
import {
  CHOROPLETH_FILL_OPACITY_EXPR,
  CHOROPLETH_OUTLINE_COLOR,
  CHOROPLETH_OUTLINE_WIDTH,
  choroplethFillColor,
  divergingFillColor,
} from "../../styles/mapTokens";
import { DEFAULT_METRIC, METRICS } from "./metrics";
import { useChoroplethGeometry } from "./useChoroplethGeometry";
import { useChoroplethValues } from "./useChoroplethValues";

/** 色分け source の id（geometry と values を結ぶ feature-state の対象）。 */
const SOURCE_ID = "choropleth";
/** 区の輪郭線レイヤーの id。 */
const OUTLINE_LAYER_ID = "choropleth-outline";
/** 面塗りレイヤーの id（輪郭線より下＝線を塗りで隠さない）。 */
const FILL_LAYER_ID = "choropleth-fill";

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
 * 面塗りレイヤーのスタイルを値域と配色方式から組む。
 *
 * 配色方式は指標定義（{@link METRICS}）の `scale` で分岐する：量＝sequential（緑・0起点でなくてよい）、
 * 符号付き＝diverging（0 中央の発散）。**データなしは色抜き**：value（feature-state）が無い/null の feature は
 * fill-opacity を 0 にし基図をそのまま見せる（ADR-0011）。値がある feature だけ不透明度を載せる。
 */
function buildFillLayer(min: number, max: number, scale: "sequential" | "diverging"): FillLayer {
  return {
    id: FILL_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color":
        scale === "diverging" ? divergingFillColor(min, max) : choroplethFillColor(min, max),
      // データなしは色抜き（state 未設定/null は不透明度0）。式はトークンに集約（§4）。
      "fill-opacity": CHOROPLETH_FILL_OPACITY_EXPR,
    },
  };
}

/**
 * ChoroplethLayer は境界（形）に指標値を載せて面塗りする（ADR-0016 値とジオメトリの分離）。
 *
 * 形は geojson source（指標に依らず共通＝1度だけ取得）、値は指標ごとに別経路で取得し setFeatureState で
 * 5桁コード結合する（状態の真実は値、setFeatureState は描画の鏡・frontend-conventions §3）。
 * **形と値が両方そろってから state を張る**（source 描画前の setFeatureState は無視されるため）。
 * **指標切替では removeFeatureState で一旦消してから張り直す**（前指標の持ち越し防止・§3）。
 * 配色方式は指標定義の `scale` で分岐（面積=sequential緑／人口増減=diverging紫↔緑・0中央）。
 * データなし（status none/suppressed、value=null）は塗らない＝色抜き（ADR-0011）。
 *
 * @param metric 表示する指標キー（未指定は {@link DEFAULT_METRIC}）。
 */
export function ChoroplethLayer({ metric = DEFAULT_METRIC }: { metric?: string }) {
  const { current: map } = useMap();
  const { data: geometry } = useChoroplethGeometry();
  const { data: values } = useChoroplethValues(metric);
  const def = METRICS[metric];

  // 値域 [min,max]：present かつ value!=null（数値）の値だけから取る。
  // 符号付き（増減率）は負を含むため min が負になりうる（発散配色が 0 中央で受ける）。
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
  // ＝色抜き条件（fill-opacity の present フラグ）に乗る。毎回 removeFeatureState で一旦消してから張り直す
  // （前指標の値が残らない）。**指標切替は values が差し替わる（query キーに metric を含む）ことで本 effect が
  // 再実行されるため、metric 自体を依存に足す必要はない**（values が真実・metric は冗長依存＝Biome 指摘）。
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
  // scale は指標定義から（未知 metric は安全側で sequential）。
  const scale = def?.scale ?? "sequential";
  const fillLayer = range ? buildFillLayer(range.min, range.max, scale) : null;

  return (
    // feature.id は geometry API が5桁コードを付与済み（文字列トップレベル id）。MapLibre はこれを
    // feature-state の結合に使える（実機で確認済＝色分けが効いていた）。promoteId は付けない。
    <Source id={SOURCE_ID} type="geojson" data={geometry}>
      {/* 面塗り（下）→ 輪郭線（上）の順で重ね、塗りが線を隠さないようにする。 */}
      {fillLayer && <Layer {...fillLayer} />}
      <Layer {...outlineLayer} />
    </Source>
  );
}
