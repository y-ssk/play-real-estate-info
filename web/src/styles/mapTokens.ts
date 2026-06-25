import type { LineLayer } from "react-map-gl/maplibre";

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
