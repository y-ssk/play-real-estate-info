import type { FeatureCollection, MultiPolygon } from "geojson";

/**
 * 色分け（区を塗る）の境界ジオメトリ1件分の属性。
 *
 * 値（指標）はこの形に含めない＝形と値を別経路で運ぶ継ぎ目（ADR-0016）。
 * 塗りは後続スライスで `setFeatureState` により feature.id（5桁コード）結合する。
 */
export interface GeometryFeatureProperties {
  /** 市区町村の5桁コード。feature.id にも同値が入る（API付与済み・ADR-0016）。 */
  code: string;
  /** 市区町村名（表示・確認用）。 */
  name: string;
}

/**
 * `GET /api/choropleth/geometry` の応答型。
 *
 * RFC7946 GeoJSON FeatureCollection（座標系4326）。各 feature は MultiPolygon の境界で、
 * `id` に5桁コードが付与され（promoteId 不要）、properties は {@link GeometryFeatureProperties}。
 * 形のみ＝指標値は含まない（ADR-0016 (i) 値とジオメトリの分離）。
 */
export type ChoroplethGeometry = FeatureCollection<MultiPolygon, GeometryFeatureProperties>;

/** 形API のパス。dev では Rsbuild が :8080 の Go へ転送する（rsbuild.config.ts proxy）。 */
const GEOMETRY_PATH = "/api/choropleth/geometry";

/**
 * fetchChoroplethGeometry は色分けの境界ジオメトリ（形のみ）を取得する（ADR-0016）。
 *
 * 取得・キャッシュ・失敗の管理は呼び出し側の TanStack Query に委ねる（ADR-0018）＝
 * ここは fetch と型付けに徹し、HTTP エラーは投げて Query の error 経路へ渡す。
 */
export async function fetchChoroplethGeometry(): Promise<ChoroplethGeometry> {
  const res = await fetch(GEOMETRY_PATH);
  if (!res.ok) {
    throw new Error(`境界ジオメトリの取得に失敗しました (HTTP ${res.status})`);
  }
  return (await res.json()) as ChoroplethGeometry;
}
