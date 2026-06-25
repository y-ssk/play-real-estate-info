/**
 * 地図レイヤー用の用途トークン（DESIGN §1・§4）。
 *
 * MapLibre の paint は CSS 変数を解さず生の値しか受けないため、CSS とは別に
 * ここで「用途名→値」を一箇所に集約する。コンポーネントは生値を直書きせず本トークンを参照する
 * （DESIGN §4 トークン経由の原則）。色の出自は melta-ui のスレート系（DESIGN §1 ベース＝黒子）。
 */

/**
 * 区の輪郭線の色。melta-ui のスレート系（slate-400 = #94a3b8）。
 *
 * なぜ slate-400 か：淡色基図（GSI pale）の上で区界を判別させるには slate-200/300
 * （divider 標準）では薄すぎる。境界は「読ませる線」だが操作色ではないため、差し色のコーラルは
 * 使わずスレート系に留める（DESIGN §1 データ色とUI色の衝突回避・差し色は点で使う）。
 */
export const CHOROPLETH_OUTLINE_COLOR = "#94a3b8";

/** 区の輪郭線の太さ（px）。黒子として細く＝基図の地名・道路を潰さない（DESIGN「UIは黒子」）。 */
export const CHOROPLETH_OUTLINE_WIDTH = 1;
