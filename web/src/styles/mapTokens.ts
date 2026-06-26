import type { FillLayer, LineLayer } from "react-map-gl/maplibre";

/**
 * 地図レイヤー用の用途トークン（DESIGN §1・§4）。
 *
 * MapLibre の paint は CSS 変数を解さず生の値しか受けないため、CSS とは別に
 * ここで「用途名→値」を一箇所に集約する。コンポーネントは生値を直書きせず本トークンを参照する
 * （DESIGN §4 トークン経由の原則）。色の出自は melta-ui のスレート系（DESIGN §1 ベース＝黒子）。
 */

/**
 * 区の輪郭線の色。melta-ui のスレート系（slate-600 = #475569）。
 *
 * なぜ slate-600 か：淡色基図（GSI pale）の上で区界をはっきり判別させるため。slate-400 では
 * グレーが薄く、拡大時に基図の地名・道路へ紛れて見えづらかった（層4 目視）。境界は「読ませる線」だが
 * 操作色ではないため、差し色のコーラルは使わずスレート系で濃さだけ上げる（DESIGN §1 データ色とUI色の分離）。
 */
export const CHOROPLETH_OUTLINE_COLOR = "#475569";

/** 区の輪郭線の太さの型（react-map-gl の LineLayer paint から導出＝外部型を推測しない）。 */
type OutlineWidth = NonNullable<LineLayer["paint"]>["line-width"];

/**
 * 区の輪郭線の太さ（px）。ズーム連動：引き（都全体）では細く基図を潰さず、寄るほど太くして
 * 拡大時の視認性を保つ（層4 目視で「拡大すると見づらい」への対処）。固定1pxだと寄った時に細く埋もれる。
 */
export const CHOROPLETH_OUTLINE_WIDTH: OutlineWidth = [
  "interpolate",
  ["linear"],
  ["zoom"],
  9,
  0.6,
  12,
  1.4,
  15,
  3,
  17,
  5,
];

/**
 * 面塗りの段階色ランプ（逐次＝シーケンシャル・DESIGN §1）。
 *
 * 用途＝「量の多寡」を濃淡で見せる中立系（面積・人口・相場など）。**青（浸水想定の慣例色）と
 * コーラル（UIの操作色）を避ける**（DESIGN §1 データ色とUI色の分離・慣例の保護）ため、緑系の
 * 単色シーケンシャル（淡→濃）を採る。緑はハザード（青/暖色）にも操作色にも被らない中立量の色。
 * 段は5段（薄い順）。凡例（{@link CHOROPLETH_FILL_LEGEND}）と同じ並びで一貫させる。
 */
export const CHOROPLETH_FILL_RAMP = [
  "#edf8e9",
  "#bae4b3",
  "#74c476",
  "#31a354",
  "#006d2c",
] as const;

/** 面塗りの不透明度。基図（地名・道路）を透かして読めるよう塗りつぶさない（層4 目視）。 */
export const CHOROPLETH_FILL_OPACITY = 0.6;

/** 面塗りの fill-opacity paint の型（react-map-gl の FillLayer から導出）。 */
type FillOpacity = NonNullable<FillLayer["paint"]>["fill-opacity"];

/**
 * 面塗りの不透明度式：**データなしは色抜き**（ADR-0011）。
 *
 * feature-state の `present`（present・数値を持つ feature にだけ true を setFeatureState 済み）が真の
 * feature だけ不透明にし、値が無い（データなし/秘匿＝state 未設定 → present は null）feature は不透明度0
 * ＝基図をそのまま見せる。null 比較は MapLibre 式の型に乗らないため真偽フラグ `present` で判定する
 * （feature 側で生式を書かない・§4。値0＝該当なしは present=true ゆえ塗られ「未調査」と区別される）。
 */
export const CHOROPLETH_FILL_OPACITY_EXPR: FillOpacity = [
  "case",
  ["==", ["feature-state", "present"], true],
  CHOROPLETH_FILL_OPACITY,
  0,
];

/**
 * 凡例の段（色と「この色が表す値域の下限」）。
 *
 * 面塗りの色式（{@link choroplethFillColor}）と同じ stops から作るため、凡例と地図の色が必ず一致する
 * （二重管理しない）。下限値は値域 [min,max] を等間隔で5分割した境界（凡例コンポーネントが整形する）。
 */
export interface FillLegendStop {
  /** 段の色（ランプと同じ）。 */
  color: string;
  /** この段が表す値の下限（min から等間隔）。 */
  lowerBound: number;
}

/** 面塗りの fill paint の型（react-map-gl の FillLayer から導出＝外部型を推測しない）。 */
type FillColor = NonNullable<FillLayer["paint"]>["fill-color"];

/**
 * choroplethFillColor は値域 [min,max] を {@link CHOROPLETH_FILL_RAMP} で段階色に写す式を返す。
 *
 * feature-state の `value` を読み、min→max を5段の緑へ線形補間する（`interpolate`）。**データなし
 * （state に value が無い／null）は塗らない＝色抜き**：value が無い feature では `feature-state` の
 * value が未定義になり、`fill-color` は評価されず（fill-opacity を別途 0 にして抜く・ChoroplethLayer 側）
 * 基図がそのまま見える。色段の境界はランプと同一なので凡例と必ず一致する。
 *
 * @param min 値域の下限（描画対象の最小値）。
 * @param max 値域の上限（描画対象の最大値）。
 */
export function choroplethFillColor(min: number, max: number): FillColor {
  // min==max（全単位同値・1件のみ等）の退化を避け、最低限の幅を確保する（ゼロ除算的な潰れ防止）。
  const span = max > min ? max - min : 1;
  const stops = CHOROPLETH_FILL_RAMP.flatMap((color, i) => {
    const bound = min + (span * i) / (CHOROPLETH_FILL_RAMP.length - 1);
    return [bound, color];
  });
  return ["interpolate", ["linear"], ["feature-state", "value"], ...stops] as FillColor;
}

/**
 * choroplethFillLegend は凡例の段（色＋下限値）を返す（地図の色式と同じ stops＝必ず一致）。
 *
 * @param min 値域の下限。
 * @param max 値域の上限。
 */
export function choroplethFillLegend(min: number, max: number): FillLegendStop[] {
  const span = max > min ? max - min : 1;
  return CHOROPLETH_FILL_RAMP.map((color, i) => ({
    color,
    lowerBound: min + (span * i) / (CHOROPLETH_FILL_RAMP.length - 1),
  }));
}

/**
 * CHOROPLETH_FILL_LEGEND は凡例コンポーネント等が参照する色段の並び（薄→濃）。
 * 値域に依存しない「色の並び」だけが欲しい場面用（値域つきは {@link choroplethFillLegend}）。
 */
export const CHOROPLETH_FILL_LEGEND = CHOROPLETH_FILL_RAMP;
