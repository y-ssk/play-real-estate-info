import type { FillLayer, LineLayer } from "react-map-gl/maplibre";

/** 面塗りの fill-opacity paint の型（react-map-gl の FillLayer から導出）。ホバー面・データ色抜きで共用。 */
type FillOpacity = NonNullable<FillLayer["paint"]>["fill-opacity"];

/** 面塗りの fill-color paint の型（react-map-gl の FillLayer から導出）。ホバー面・段階色で共用。 */
type FillColor = NonNullable<FillLayer["paint"]>["fill-color"];

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
 * 選択中の単位の強調輪郭色＝コーラル brand（`--coral-500` = #F2615A）。
 *
 * なぜコーラルへ昇格したか：ADR-0027 で差し色コーラルの hex が確定した（旧コメントの「hex 未確定ゆえ
 * スレート」という保留が解けた・docs/99「差し色 hex 確定後に昇格」宿題の実施）。選択リングは DESIGN §1 の
 * 「文字を載せない強調＝brand」に当たり、選択中の1区だけ（点使い）に出すため面で青と衝突しない。線は1区分
 * ＝細い「点」なのでデータ色（青/暖色）とも干渉せず、確定（コーラル）と一時ホバー（near-black 中立）が色で割れる。
 */
export const CHOROPLETH_SELECTED_OUTLINE_COLOR = "#f2615a";

/**
 * 選択中の単位の強調輪郭の太さ式：feature-state `selected` が真の feature だけ太く描く（ズーム連動・最上位）。
 *
 * 通常輪郭（{@link CHOROPLETH_OUTLINE_WIDTH}）・ホバー輪郭（{@link CHOROPLETH_HOVER_OUTLINE_WIDTH}）の上に
 * 重ねる別レイヤーで使う。選択していない feature は幅0＝描かれない（過剰な強調を避ける）。状態の真実は選択
 * ストア（Zustand）で、ここは描画の鏡（setFeatureState 経由・frontend-conventions §3）。
 * **各ズームで「ホバー > 通常」をさらに上回る**よう設定し、選択（確定）が常に最も太く見える（重ね順も最上位）。
 */
export const CHOROPLETH_SELECTED_OUTLINE_WIDTH: OutlineWidth = [
  "case",
  ["==", ["feature-state", "selected"], true],
  ["interpolate", ["linear"], ["zoom"], 9, 3.5, 12, 4.3, 15, 6, 17, 8],
  0,
];

/**
 * ホバー強調の輪郭色＝はっきり見える near-black 中立（slate-900 = #0f172a）。
 *
 * なぜ near-black 中立か：ホバーは「ここに乗っている」一時の合図で、確定の選択（コーラル brand）とは別物。
 * 差し色を使うと一時/確定の区別が消え、点使い（DESIGN §1）も崩れるため中立スレート系で示す。旧 slate-700 は
 * 通常輪郭（slate-600）と濃さが近く見分けられなかった（層4 目視）＝最も濃い near-black にして通常線と判別させる。
 * データ色（青/暖色）とも衝突しない。色は mapTokens に集約（feature 側で生値を書かない・DESIGN §4）。
 * 重ね順は選択が上＝ホバー中かつ選択中はコーラルの選択強調が勝つ（一時より確定を優先・ChoroplethLayer のレイヤー順）。
 */
export const CHOROPLETH_HOVER_OUTLINE_COLOR = "#0f172a";

/**
 * ホバー強調輪郭の太さ式：feature-state `hover` が真の feature だけ縁取る（外れたら幅0＝消える・ズーム連動）。
 *
 * **常に通常輪郭（{@link CHOROPLETH_OUTLINE_WIDTH}・0.6→5px）を各ズームで +1.5px 以上上回る**よう設定する。
 * 旧実装は幅2固定で、拡大時に通常輪郭（17で5px）へ負けてホバーが見えなくなった（層4 目視）。ズーム連動で
 * 引き〜寄りのどこでも通常線より太く＝触れている区がはっきり分かる。選択（{@link CHOROPLETH_SELECTED_OUTLINE_WIDTH}）
 * よりは細く保ち、確定が最も太い序列を崩さない。
 */
export const CHOROPLETH_HOVER_OUTLINE_WIDTH: OutlineWidth = [
  "case",
  ["==", ["feature-state", "hover"], true],
  ["interpolate", ["linear"], ["zoom"], 9, 2.4, 12, 3.2, 15, 4.8, 17, 6.8],
  0,
];

/**
 * ホバー中の自治体に全面へかける中立オーバーレイの色（slate-900 = #0f172a）。
 *
 * 輪郭線だけでは「面（ポリゴン全体）が反応している」感が弱い（層4 目視の指摘）。ホバー中の自治体に淡い
 * 中立オーバーレイを重ね、面ごと反応させる。near-black の中立でデータ色（青/暖色）と色相で競合しない
 * （混ざって別の色味に見えない）。不透明度は低く保ちデータ色を透かす（{@link CHOROPLETH_HOVER_FILL_OPACITY_EXPR}）。
 */
export const CHOROPLETH_HOVER_FILL_COLOR: FillColor = "#0f172a";

/**
 * ホバーオーバーレイの不透明度式：feature-state `hover` が真の自治体だけ淡く重ね、他は0（重ねない）。
 *
 * 0.12＝データ色・基図が透けて読める淡さ（0.10〜0.15 の中庸）。輪郭線（{@link CHOROPLETH_HOVER_OUTLINE_WIDTH}）と
 * 同じ `hover` フラグで連動＝マウスが乗った自治体だけ面+線が一緒に強調される。式はトークンに集約（§4）。
 */
export const CHOROPLETH_HOVER_FILL_OPACITY_EXPR: FillOpacity = [
  "case",
  ["==", ["feature-state", "hover"], true],
  0.12,
  0,
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

/**
 * 発散（diverging）配色ランプ（DESIGN §1・色覚配慮）。
 *
 * 用途＝**符号付きの指標**（人口増減率など 0 を境に減少↔増加）。中央0を境に2色へ分かれ、「増えた/減った」が
 * 一目で割れる。**青（浸水想定の慣例色）とコーラル（UI の操作色）を避ける**（DESIGN §1 データ色とUI色の分離）
 * ため、ColorBrewer **PRGn**（紫↔緑・色覚配慮の発散系）を採る：減少側＝紫、中央≒0＝淡い中立、増加側＝緑。
 * 緑は逐次ランプ（面積）でも使うが、発散の片側＋別画面（指標切替で同時に出ない）ゆえ衝突しない（タスク許容）。
 * 5段（減少濃→…→中央→…→増加濃）。色順は固定で凡例（{@link divergingFillLegend}）と一致させる。
 */
export const CHOROPLETH_DIVERGING_RAMP = [
  "#7b3294", // 強い減少（紫・濃）
  "#c2a5cf", // 弱い減少（紫・淡）
  "#f7f7f7", // 中央 ≒ 0%（中立・淡灰）
  "#a6dba0", // 弱い増加（緑・淡）
  "#008837", // 強い増加（緑・濃）
] as const;

/**
 * divergingFillColor は **0 を視覚中心**に固定した発散配色式を返す（中央のランプ色が値0に当たる）。
 *
 * なぜ対称ドメインか：発散配色は「0 が中央色」でないと増減の境がずれて誤読する。データの min/max を
 * そのまま使うと中点がデータ依存になり 0 が中央に来ない。よって `bound = max(|min|,|max|)` で domain を
 * `[-bound, +bound]` の対称区間にし、`-bound, -bound/2, 0, +bound/2, +bound` を5段へ線形補間する
 * ＝0 が必ず中央のランプ色（中立）に当たる。値が無い feature の色抜きは fill-opacity 側で行う（§3）。
 *
 * @param min 値域の下限（負を含みうる）。
 * @param max 値域の上限。
 */
export function divergingFillColor(min: number, max: number): FillColor {
  const bound = divergingBound(min, max);
  const stops = CHOROPLETH_DIVERGING_RAMP.flatMap((color, i) => {
    // i=0→-bound, i=2→0, i=4→+bound（中央を0に固定）。
    const t = i / (CHOROPLETH_DIVERGING_RAMP.length - 1); // 0..1
    const value = -bound + 2 * bound * t;
    return [value, color];
  });
  return ["interpolate", ["linear"], ["feature-state", "value"], ...stops] as FillColor;
}

/**
 * divergingFillLegend は発散凡例の段（色＋下限値）を返す（地図の色式と同じ stops＝必ず一致・0 中央）。
 *
 * @param min 値域の下限。
 * @param max 値域の上限。
 */
export function divergingFillLegend(min: number, max: number): FillLegendStop[] {
  const bound = divergingBound(min, max);
  return CHOROPLETH_DIVERGING_RAMP.map((color, i) => {
    const t = i / (CHOROPLETH_DIVERGING_RAMP.length - 1);
    return { color, lowerBound: -bound + 2 * bound * t };
  });
}

/**
 * divergingBound は発散配色の対称ドメイン半径 `max(|min|,|max|)` を返す。
 * 全単位同値・0 のみ等で 0 になる退化を避け、最低限の幅を確保する（interpolate のゼロ幅潰れ防止）。
 */
function divergingBound(min: number, max: number): number {
  const b = Math.max(Math.abs(min), Math.abs(max));
  return b > 0 ? b : 1;
}
