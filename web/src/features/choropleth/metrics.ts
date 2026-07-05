/**
 * 面塗り指標の定義集（指標ごとの見せ方を1か所に集約）。
 *
 * なぜ registry か：指標が増えるたび（面積→人口増減率→…）に各コンポーネント（Layer/Legend/Toggle）へ
 * 散らばる「表示名・単位・配色方式・出典・整形」を一覧で持つ＝指標追加が1エントリ追加で済む
 * （ADR-0009 で将来人口が主軸・分野横断の切替が積み増される・docs/99 実装スライス）。
 *
 * 配色方式（scale）が指標ごとに違うのが本 registry の肝：
 *  - `sequential` … 量の多寡（面積・人口など非負量）。淡→濃の単方向ランプ（`mapTokens` 緑系）。
 *  - `diverging`  … 符号付き（増減率＝0%を境に減少↔増加）。中央0を境に2色へ分かれる発散ランプ
 *    （`mapTokens` 紫↔緑）。0 中心ゆえ「増えた/減った」が一目で割れる。
 * 配色の実体（色値・式）は `mapTokens.ts` に集約し、ここは「どの方式か・どの色相か」だけを持つ（生値を持たない・§4）。
 */

import {
  CHOROPLETH_FILL_RAMP,
  CHOROPLETH_FILL_RAMP_BLUE,
  CHOROPLETH_FILL_RAMP_GREY,
  CHOROPLETH_FILL_RAMP_PURPLE,
} from "../../styles/mapTokens";

/** 面塗りの配色方式（値→色の写し方）。`mapTokens` の色式とランプを選ぶ軸。 */
export type MetricScale = "sequential" | "diverging";

/**
 * 逐次指標の色相（分野で色相を束ねる・`ADR-0032`）。`scale:"sequential"` の指標が持つ。
 *
 * 分野で色相を分け、トグルで指標を切り替えた時に「今どの分野か」を色相で識別できるようにする
 * （緑独占の解消）：緑=相場／紫=将来(高齢化)／灰=基盤(面積)。各色相のランプ実体は `mapTokens`
 * （`CHOROPLETH_FILL_RAMP`/`_PURPLE`/`_GREY`）に集約し、ここは「どの色相か」だけを持つ（生値を持たない・§4）。
 * **発散（diverging）は 0 中央の PRGn 固定ゆえ hue を持たない**（人口増減など符号付き専用）。
 * **将来 sequential 指標を足す人は必ず色相を選ぶ**＝体系から外れられない構造（`ADR-0032` 結論・実装）。
 * 緑=相場／紫=将来(高齢化)／灰=基盤(面積)／青=浸水(洪水該当面積率＝水害の慣例色・`ADR-0032` 予約色)。
 */
export type MetricHue = "green" | "purple" | "grey" | "blue";

/**
 * 1指標の表示定義の共通部分（値そのものは `/values` から取り、ここは「見せ方」だけを持つ）。
 * 配色方式（scale）で {@link MetricDef} を判別ユニオンに分けるための土台。
 */
interface MetricDefBase {
  /** 指標キー（`/api/choropleth/values?metric=` と一致＝結合キー）。 */
  key: string;
  /** 凡例・トグルの表示名（日本語）。 */
  title: string;
  /** 単位の表示（凡例の右端等）。無単位（率を%表示する等）は空文字。 */
  unit: string;
  /** 出典表示（法的要件・ADR-0011／frontend-conventions §5）。推計は「推計」を明示（ADR-0009）。 */
  source: string;
  /**
   * 凡例の値整形。指標で桁・単位・%表示が違うため指標ごとに持つ
   * （面積=km²小数1桁／増減率=%・符号付き）。
   */
  format: (value: number) => string;
}

/**
 * 1指標の表示定義（配色方式で判別する判別ユニオン）。
 *
 * **`scale:"sequential"` は `hue`（分野色相）を必須にする**（`ADR-0032`）＝将来 sequential 指標を足す人は
 * 型で色相の指定を強制され、色相体系から外れられない（`hue` を書かないとコンパイルが通らない・緑独占の再発防止）。
 * **`scale:"diverging"` は `hue` を持たない**（0 中央の PRGn 固定・符号付き専用）＝余計な色相指定を型で禁じる。
 */
export type MetricDef =
  | (MetricDefBase & {
      /** 配色方式＝量（非負量を淡→濃の単方向ランプで見せる）。 */
      scale: "sequential";
      /** 分野色相（必須・`ADR-0032`）。緑=相場／紫=将来(高齢化)／灰=基盤(面積)。ランプ実体は `mapTokens`。 */
      hue: MetricHue;
    })
  | (MetricDefBase & {
      /** 配色方式＝符号付き（0 を境に減少↔増加を PRGn 発散ランプで見せる）。色相は固定ゆえ `hue` を持たない。 */
      scale: "diverging";
    });

/** パーセント整形（符号付き・小数1桁）。増減率（0.15→「+15.0%」, -0.08→「-8.0%」）に使う。 */
function formatPercentSigned(value: number): string {
  const pct = value * 100;
  const sign = pct > 0 ? "+" : ""; // 負は toLocaleString が "-" を付ける。0 は無印。
  return `${sign}${pct.toLocaleString("ja-JP", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

/**
 * パーセント整形（符号なし・小数1桁）。高齢化率（0.35→「35.0%」）に使う。
 * 増減率と違い高齢化率は「量（比率の水準）」で常に非負ゆえ + 符号を付けない（{@link formatPercentSigned} と別関数）。
 */
function formatPercent(value: number): string {
  const pct = value * 100;
  return `${pct.toLocaleString("ja-JP", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

/**
 * パーセント整形（既に % 値・符号なし・小数1桁）。洪水該当面積率（45.3→「45.3%」）に使う。
 * 高齢化率（{@link formatPercent}）や増減率（{@link formatPercentSigned}）は 0〜1 の比率を持ち ×100 するが、
 * 洪水該当面積率は集計 SQL の時点で 0〜100 の % 値を格納する（区に重なる浸水面積÷区面積×100・設計 note §3）。
 * ゆえに **ここで ×100 しない**（二重に 100 倍しない＝100超の誤表示を避ける）。0% は該当なし（present）を表す。
 */
function formatPercentRaw(value: number): string {
  return `${value.toLocaleString("ja-JP", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}

/** 面積整形（小数1桁・桁区切り）。 */
function formatKm2(value: number): string {
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

/** 円整形（整数・桁区切り）。地価（円/㎡）は端数を持たない大きな整数ゆえ小数を出さずカンマ区切りで示す。 */
function formatYen(value: number): string {
  return Math.round(value).toLocaleString("ja-JP", { maximumFractionDigits: 0 });
}

/**
 * 面塗り指標の registry（キー→定義）。新指標はここに1エントリ足す。
 *
 * - `area_km2`（②a・既存）：市区町村面積。量＝sequential・色相=灰（基盤・`ADR-0032`）。出典は N03 由来の算出。
 * - `pop_change_rate_2020_2050`（②c）：将来人口増減率。符号付き＝diverging（0%中心・PRGn 固定＝hue なし）。
 *   **推計値ゆえ出典に「推計(2020→2050)」を明示**（ADR-0009 断定しない）。
 * - `aging_rate_2050`（②e）：高齢化率（推計 2050）。非負の比率＝量＝sequential・色相=紫（将来・`ADR-0032`）。
 *   **推計値ゆえ出典に「推計(2050)」を明示**（ADR-0009）。市区町村ごとに ΣPTC/ΣPTN（人口重み付き比）。
 * - `land_price_median`（2d）：公的地価の中央値。量＝sequential・色相=緑（相場・`ADR-0032`）。
 * - `flood_area_coverage_rate`（#74）：洪水浸水想定区域（想定最大規模）の該当面積率(%)。非負の面積率＝量＝
 *   sequential・色相=青（浸水＝水害の慣例色・`ADR-0032` 予約色）。値は集計 SQL の時点で 0〜100 の % 値
 *   （区に重なる浸水面積÷区面積×100）。出典に XKT026・「想定最大規模」を明示（ADR-0006/0011）。
 *
 * 色相（hue）は分野で色相を束ねる体系（緑=相場／紫=将来／灰=基盤／青=浸水・`ADR-0032`）。トグルで指標を切り替えても
 * 色相で分野が識別できる（かつての緑独占＝全逐次が緑で見分けづらかった懸念の解消）。**発散は hue を持たない**。
 */
export const METRICS: Record<string, MetricDef> = {
  area_km2: {
    key: "area_km2",
    title: "市区町村の面積",
    unit: "km²",
    scale: "sequential",
    // 基盤（面積）＝分野横断の量ゆえ中立の灰で束ねる（`ADR-0032`）。境界線スレートとの紛れは層4評価。
    hue: "grey",
    source: "出典：国土数値情報 行政区域データ（N03）より算出",
    format: formatKm2,
  },
  pop_change_rate_2020_2050: {
    key: "pop_change_rate_2020_2050",
    title: "将来人口の増減率（推計 2020→2050）",
    unit: "",
    scale: "diverging",
    source: "出典：国土数値情報 将来推計人口250mメッシュ（XKT013）／推計（2020→2050）",
    format: formatPercentSigned,
  },
  aging_rate_2050: {
    key: "aging_rate_2050",
    title: "高齢化率（推計 2050）",
    unit: "",
    // 量＝sequential（高齢化率は非負の比率＝多寡を濃淡で見せる。0起点でなくてよい）。
    // 増減率のような符号付き（0中心で発散）ではないため diverging にしない。
    scale: "sequential",
    // 将来分野＝紫で束ねる（人口増減=発散 紫↔緑・高齢化=逐次 紫・`ADR-0032`）。見え方は層4評価。
    hue: "purple",
    // 将来推計人口(XKT013)由来・推計2050 の高齢化率（65歳以上人口÷総数）。**推計ゆえ「推計」を明示**
    // （ADR-0009 断定しない・ADR-0011 出典は法的要件）。算出は市区町村ごとに ΣPTC/ΣPTN（人口重み付き比）。
    source:
      "出典：国土数値情報 将来推計人口250mメッシュ（XKT013）／推計（2050）・65歳以上人口÷総数",
    format: formatPercent,
  },
  land_price_median: {
    key: "land_price_median",
    title: "公的地価の中央値（住宅地）",
    unit: "円/㎡",
    // 量＝sequential（非負の地価水準。0起点でなくてよい）。相場分野＝緑で束ねる（`ADR-0032`）。
    scale: "sequential",
    hue: "green",
    // 公的地価（地価公示＋地価調査）由来・住宅地の当年地価の中央値（ADR-0008/0011 出典は法的要件）。
    source:
      "出典：国土交通省 不動産情報ライブラリ 地価公示・地価調査（XPT002）／住宅地・当年・中央値",
    format: formatYen,
  },
  flood_area_coverage_rate: {
    key: "flood_area_coverage_rate",
    title: "洪水浸水想定区域の該当面積率",
    unit: "%",
    // 量＝sequential（非負の面積率＝0〜100% の多寡を濃淡で見せる。0起点でなくてよい）。
    // 浸水分野＝青で束ねる（水害の慣例色・`ADR-0032` 予約色）。見え方は層4評価。
    scale: "sequential",
    hue: "blue",
    // 洪水浸水想定区域（想定最大規模・XKT026）由来。区に重なる浸水面積÷区面積×100（交差面積按分・
    // ADR-0006 該当面積率・ADR-0015）。「想定最大規模」で実績でなく想定であることを示す（ADR-0011 出典は法的要件）。
    source:
      "出典：国土数値情報 洪水浸水想定区域（想定最大規模）（XKT026）／区に重なる浸水面積÷区面積",
    // 値は 0〜100 の % 値（集計 SQL で ×100 済み）ゆえ ×100 しない整形を使う（他の率指標と違う点・上の関数参照）。
    format: formatPercentRaw,
  },
};

/** 面塗りで切り替えられる指標キーの並び（トグルの表示順）。 */
export const METRIC_ORDER: readonly string[] = [
  "area_km2",
  "pop_change_rate_2020_2050",
  "aging_rate_2050",
  "land_price_median",
  "flood_area_coverage_rate",
];

/** 既定の表示指標（初期表示）。 */
export const DEFAULT_METRIC = "area_km2";

/**
 * 色相（{@link MetricHue}）→逐次ランプ（`mapTokens`）の対応表（**1か所**・`ADR-0032`）。
 *
 * Layer/Legend はここを介してランプを引き、`choroplethFillColor`/`choroplethFillLegend` に渡す
 * ＝色相→ランプの対応が分散しない（体系から外れられない構造）。ランプ実体は `mapTokens` に集約（§4）。
 */
export const HUE_RAMPS: Record<MetricHue, readonly string[]> = {
  green: CHOROPLETH_FILL_RAMP,
  purple: CHOROPLETH_FILL_RAMP_PURPLE,
  grey: CHOROPLETH_FILL_RAMP_GREY,
  blue: CHOROPLETH_FILL_RAMP_BLUE,
};

/**
 * sequentialFillRamp は指標定義の色相に対応する逐次ランプを返す（Layer/Legend 共通の1本の窓口）。
 *
 * 逐次指標（`scale:"sequential"`）は必ず `hue` を持つ（型で保証・`ADR-0032`）ため色相からランプが一意に決まる。
 * 発散指標は本関数を通さない（0 中央の PRGn 固定・呼び出し側が scale で分岐）。未知/未定義 metric は安全側で緑。
 *
 * @param def 指標定義（未定義もあり得る＝未知 metric キー）。
 */
export function sequentialFillRamp(def: MetricDef | undefined): readonly string[] {
  if (def && def.scale === "sequential") {
    return HUE_RAMPS[def.hue];
  }
  return CHOROPLETH_FILL_RAMP;
}
