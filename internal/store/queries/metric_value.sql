-- 値配信（ADR-0016 (i) 値とジオメトリの分離）の値クエリ。形は別経路（geometry）ゆえここは値だけ。
-- GET /api/choropleth/values?metric=<key> が指定 metric の全単位を返し、FE は setFeatureState で
-- feature.id（5桁コード）へ結合して塗る。data_status を一緒に返し「データなし3区別」を FE まで運ぶ
-- （ADR-0011・色抜き判定に使う）。
-- 静的クエリ（実行時に形が変わらない・metric/unit_kind は値の差し替えのみ）ゆえ sqlc 既定（backend-conventions §1.1）。
-- unit_kind を引数に取るのはメッシュ移行の継ぎ目（ADR-0015）：'municipality'↔'mesh250' を呼び分けるだけで同じ表が効く。

-- name: ListMetricValues :many
SELECT unit_id AS code, value, status
FROM metric_value
WHERE metric = $1
  AND unit_kind = $2
ORDER BY unit_id;
