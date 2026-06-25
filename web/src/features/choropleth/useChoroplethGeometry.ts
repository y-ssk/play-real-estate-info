import { useQuery } from "@tanstack/react-query";
import { type ChoroplethGeometry, fetchChoroplethGeometry } from "../../lib/choropleth";

/** 形ジオメトリのキャッシュキー。値（指標）は別キーで持つため形だけで一意（ADR-0016/0018）。 */
const GEOMETRY_QUERY_KEY = ["choropleth", "geometry"] as const;

/**
 * useChoroplethGeometry は色分けの境界ジオメトリ（形のみ）を取得する Query フック（ADR-0018）。
 *
 * 初手 GeoJSON 期は形も Query が持てる（ADR-0016 (ii)）。行き先のベクタタイル化後は
 * MapLibre が自前取得に移るため、その差し替えはこのフックと描画側に閉じる。
 */
export function useChoroplethGeometry() {
  return useQuery<ChoroplethGeometry>({
    queryKey: GEOMETRY_QUERY_KEY,
    queryFn: fetchChoroplethGeometry,
    // 境界は静的（更新頻度が極めて低い）。再フォーカスでの再取得は不要＝無駄な通信を避ける。
    staleTime: Number.POSITIVE_INFINITY,
  });
}
