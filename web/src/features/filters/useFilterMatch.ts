import { useMemo } from "react";
import { hasActiveCondition, useFilterStore } from "../../lib/filterStore";
import { buildUnitRows, filterUnitRows, metricValueRange } from "../../lib/filtering";
import { METRIC_ORDER } from "../choropleth/metrics";
import { useChoroplethGeometry } from "../choropleth/useChoroplethGeometry";
import { useAllMetricValues } from "./useAllMetricValues";

/** 1指標の値域（スライダーの両端＝present 値の min/max）。値が無ければ欠落。 */
export interface MetricRange {
  min: number;
  max: number;
}

/**
 * useFilterMatch は絞り込み条件（filter store）を全指標値＋geometry に突き合わせ、地図ハイライト用の
 * 該当コード集合と、スライダー描画用の指標ごとの値域を返す（④・ADR-0028 絞り込み→地図ハイライト）。
 *
 * 絞り込み・値域・実効判定はすべて純ロジック（lib/filtering の {@link filterUnitRows}/{@link buildUnitRows}/
 * {@link metricValueRange}・lib/filterStore の {@link hasActiveCondition}）に委ね、本フックは取得（Query）と
 * store の配線に徹する（React/取得層に依存しない純関数は lib・テストはそこで固める・frontend-conventions §1/§8）。
 *
 * - `matchedCodes`：**条件が1つも無ければ null**（＝絞り込み非作動＝普通の色分け地図・ChoroplethLayer が
 *   `matched` を張らない）。条件があるときだけ該当区の5桁コード集合を返す（地図ハイライトの別チャネル）。
 * - `rangesByMetric`：指標キー→値域（present 値の min/max）。スライダーの両端に使う。値が無い指標は欠落。
 *
 * データなし（status≠present）の扱いは filtering.ts に従う＝条件が課された指標でデータなしの区は除外
 * （「未調査」を「条件内」に混ぜない・ADR-0011）。
 */
export function useFilterMatch(): {
  matchedCodes: ReadonlySet<string> | null;
  rangesByMetric: Record<string, MetricRange>;
  isLoading: boolean;
  isError: boolean;
} {
  const conditions = useFilterStore((s) => s.conditions);
  const { data: geometry } = useChoroplethGeometry();
  const { byMetric, isLoading, isError } = useAllMetricValues();

  // geometry を母体に全指標を縦串へ組み直す（buildUnitRows は React 非依存の純関数）。
  const rows = useMemo(() => {
    if (!geometry) {
      return [];
    }
    const units = geometry.features.map((f) => ({
      code: f.properties.code,
      name: f.properties.name,
    }));
    return buildUnitRows(units, byMetric);
  }, [geometry, byMetric]);

  // 指標ごとの値域（present 値のみ・スライダー両端）。値が無い指標は載せない（スライダーを出せない）。
  const rangesByMetric = useMemo(() => {
    const out: Record<string, MetricRange> = {};
    for (const metricKey of METRIC_ORDER) {
      const range = metricValueRange(byMetric[metricKey] ?? []);
      if (range) {
        out[metricKey] = range;
      }
    }
    return out;
  }, [byMetric]);

  // 該当集合：条件が1つも無ければ null（非作動）。あるときだけ突き合わせて該当コードを集める。
  const matchedCodes = useMemo(() => {
    if (!hasActiveCondition(conditions)) {
      return null;
    }
    return new Set(filterUnitRows(rows, conditions).map((r) => r.code));
  }, [rows, conditions]);

  return { matchedCodes, rangesByMetric, isLoading, isError };
}
