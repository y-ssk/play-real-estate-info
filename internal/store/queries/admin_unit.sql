-- 色分け配信（ADR-0016 初手＝ST_AsGeoJSON）の形クエリ。値は別経路ゆえここは形だけ。
-- ST_AsGeoJSON(geom)::text はテキストを返す（geometry 型の特別扱い不要）。FeatureCollection の
-- 組み立ては Go 側で行い、geojson 列は生 JSON としてそのまま埋める（二重エンコードしない・handler）。
-- 静的クエリゆえ sqlc 既定（backend-conventions §1.1）。

-- name: ListMunicipalityGeometry :many
SELECT code, name, ST_AsGeoJSON(geom)::text AS geojson
FROM admin_unit
WHERE unit_kind = 'municipality'
ORDER BY code;
