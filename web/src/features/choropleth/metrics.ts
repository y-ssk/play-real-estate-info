/**
 * 面塗りで切り替えられる指標の定義（キー・表示名・単位）。
 *
 * 指標切替（F2 の芽・タスク 2b）の単一の出どころ：トグル・凡例・取得（useChoroplethValues）が
 * 同じ定義を参照することで、表示名/単位の二重管理と取り違えを防ぐ。指標が増えたら本配列に1件足す
 * （BE は metric_value の行追加・FE はここに1行＝スキーマ変更不要・ADR-0015）。
 */

/** 面塗り指標の1件。key は BE の metric_value.metric / 値API ?metric= と一致させる。 */
export interface MetricDef {
  /** 指標キー（値API ?metric= と一致）。 */
  key: string;
  /** 凡例・トグルの表示名（具体に＝何が見えるか）。 */
  title: string;
  /** 値の単位（凡例の右端に添える）。 */
  unit: string;
  /** 出典表記（法的要件・ADR-0011 (c)・frontend-conventions §5）。凡例に必ず出す。 */
  source: string;
  /** 凡例の値整形の小数桁（面積は小数1桁・人数は整数）。 */
  fractionDigits: number;
}

/**
 * 切替対象の指標一覧（並び＝トグルの選択肢順）。
 * - area_km2：②a で実証した派生指標（N03 由来の面積）。
 * - station_passengers_2023：②b の本丸 ETL（XKT015・市区町村の合計乗降客数 2023）。
 */
export const CHOROPLETH_METRICS: readonly MetricDef[] = [
  {
    key: "area_km2",
    title: "市区町村の面積",
    unit: "km²",
    source: "出典：国土数値情報 行政区域データ（N03）より算出",
    fractionDigits: 1,
  },
  {
    key: "station_passengers_2023",
    title: "駅の合計乗降客数（2023）",
    unit: "人",
    source: "出典：国土数値情報 駅別乗降客数（XKT015）2023年・市区町村合計",
    fractionDigits: 0,
  },
] as const;

/** 既定の指標（初期表示）。②a を壊さないため面積を既定に保つ。 */
// CHOROPLETH_METRICS は常に1件以上（先頭=area_km2）。strict の未チェック添字対策でフォールバックを置く。
export const DEFAULT_METRIC: string = CHOROPLETH_METRICS[0]?.key ?? "area_km2";

/** key から指標定義を引く（未知キーは undefined＝呼び出し側でフォールバック）。 */
export function findMetric(key: string): MetricDef | undefined {
  return CHOROPLETH_METRICS.find((m) => m.key === key);
}
