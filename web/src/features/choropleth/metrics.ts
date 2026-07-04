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
 * 配色の実体（色値・式）は `mapTokens.ts` に集約し、ここは「どの方式か」だけを持つ（生値を持たない・§4）。
 */

/** 面塗りの配色方式（値→色の写し方）。`mapTokens` の色式とランプを選ぶ軸。 */
export type MetricScale = "sequential" | "diverging";

/**
 * 1指標の表示定義。値そのものは `/values` から取り、ここは「見せ方」だけを持つ。
 */
export interface MetricDef {
  /** 指標キー（`/api/choropleth/values?metric=` と一致＝結合キー）。 */
  key: string;
  /** 凡例・トグルの表示名（日本語）。 */
  title: string;
  /** 単位の表示（凡例の右端等）。無単位（率を%表示する等）は空文字。 */
  unit: string;
  /** 配色方式（量＝sequential／符号付き＝diverging）。 */
  scale: MetricScale;
  /** 出典表示（法的要件・ADR-0011／frontend-conventions §5）。推計は「推計」を明示（ADR-0009）。 */
  source: string;
  /**
   * 凡例の値整形。指標で桁・単位・%表示が違うため指標ごとに持つ
   * （面積=km²小数1桁／増減率=%・符号付き）。
   */
  format: (value: number) => string;
}

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
 * - `area_km2`（②a・既存）：市区町村面積。量＝sequential（緑）。出典は N03 由来の算出。
 * - `pop_change_rate_2020_2050`（②c）：将来人口増減率。符号付き＝diverging（0%中心）。
 *   **推計値ゆえ出典に「推計(2020→2050)」を明示**（ADR-0009 断定しない）。
 * - `aging_rate_2050`（②e・本スライス）：高齢化率（推計 2050）。非負の比率＝量＝sequential（緑）。
 *   **推計値ゆえ出典に「推計(2050)」を明示**（ADR-0009）。市区町村ごとに ΣPTC/ΣPTN（人口重み付き比）。
 */
export const METRICS: Record<string, MetricDef> = {
  area_km2: {
    key: "area_km2",
    title: "市区町村の面積",
    unit: "km²",
    scale: "sequential",
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
    // 量＝sequential（高齢化率は非負の比率＝多寡を濃淡で見せる。0起点でなくてよい・緑系ランプ）。
    // 増減率のような符号付き（0中心で発散）ではないため diverging にしない。
    scale: "sequential",
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
    // 量＝sequential（非負の地価水準。0起点でなくてよい・緑系ランプは面積・人口・相場を想定＝mapTokens §逐次）。
    scale: "sequential",
    // 公的地価（地価公示＋地価調査）由来・住宅地の当年地価の中央値（ADR-0008/0011 出典は法的要件）。
    source:
      "出典：国土交通省 不動産情報ライブラリ 地価公示・地価調査（XPT002）／住宅地・当年・中央値",
    format: formatYen,
  },
};

/** 面塗りで切り替えられる指標キーの並び（トグルの表示順）。 */
export const METRIC_ORDER: readonly string[] = [
  "area_km2",
  "pop_change_rate_2020_2050",
  "aging_rate_2050",
  "land_price_median",
];

/** 既定の表示指標（初期表示）。 */
export const DEFAULT_METRIC = "area_km2";
