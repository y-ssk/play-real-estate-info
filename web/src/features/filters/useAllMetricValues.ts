import { useQueries } from "@tanstack/react-query";
import { type MetricValue, fetchMetricValues } from "../../lib/values";
import { METRIC_ORDER } from "../choropleth/metrics";

/**
 * 全指標ぶんの `/values` を取得し、指標キー→値配列の束にまとめるフック（ADR-0012 絞り込み/一覧の素材）。
 *
 * 絞り込みは「市区町村ごとの全数値」に AND で課す（ADR-0012）ため、面塗りの単一指標（`useChoroplethValues`）
 * では足りず、registry の全指標（{@link METRIC_ORDER}）を横断して値を集める。**指標が増えれば
 * registry に1エントリ足すだけで自動的に取得対象に入る**（絞り込み/一覧の土台・タスク目的）。
 *
 * `useChoroplethValues` と**同じ queryKey/queryFn**（`["choropleth","values",metric]`・`fetchMetricValues`）を
 * 使うため、面塗りで既に取得済みの指標はキャッシュを共有する（二重取得しない・ADR-0018）。
 *
 * @returns `byMetric`（指標キー→値配列）・`isLoading`（いずれか未取得）・`isError`（いずれか失敗）。
 */
export function useAllMetricValues(): {
  byMetric: Record<string, MetricValue[]>;
  isLoading: boolean;
  isError: boolean;
} {
  const results = useQueries({
    queries: METRIC_ORDER.map((metric) => ({
      // useChoroplethValues と同一キー＝面塗り取得分とキャッシュ共有（二重取得回避）。
      queryKey: ["choropleth", "values", metric] as const,
      queryFn: () => fetchMetricValues(metric),
      staleTime: Number.POSITIVE_INFINITY,
    })),
  });

  const byMetric: Record<string, MetricValue[]> = {};
  METRIC_ORDER.forEach((metric, i) => {
    const data = results[i]?.data;
    if (data) {
      byMetric[metric] = data;
    }
  });

  return {
    byMetric,
    isLoading: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
  };
}
