import { useQuery } from "@tanstack/react-query";
import { type MetricValue, fetchMetricValues } from "../../lib/values";

/**
 * 値（指標）のキャッシュキー。形（geometry）とは別キーで持つ＝値とジオメトリの分離（ADR-0016/0018）。
 * metric を含めて指標切替でキャッシュが分かれるようにする。
 */
function valuesQueryKey(metric: string) {
  return ["choropleth", "values", metric] as const;
}

/**
 * useChoroplethValues は指定 metric の市区町村値を取得する Query フック（ADR-0018）。
 *
 * 値は JSON 系ゆえ TanStack Query が守備範囲（形/タイルは行き先 A で MapLibre 自前取得＝範囲外）。
 * 取得後、描画側が feature.id（5桁コード）へ setFeatureState で結合して塗る（状態の真実は値、
 * setFeatureState は描画の鏡・frontend-conventions §3）。
 *
 * @param metric 指標キー（例 `"area_km2"`）。
 */
export function useChoroplethValues(metric: string) {
  return useQuery<MetricValue[]>({
    queryKey: valuesQueryKey(metric),
    queryFn: () => fetchMetricValues(metric),
    // 指標値は年度更新（極めて低頻度）。再フォーカスでの再取得は不要＝無駄な通信を避ける。
    staleTime: Number.POSITIVE_INFINITY,
  });
}
