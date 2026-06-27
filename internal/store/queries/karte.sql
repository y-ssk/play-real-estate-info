-- カルテ（街を選ぶと出る詳細パネル・ADR-0011）の取得クエリ。
-- 値配信（/values）が「1指標×全単位」を横に引くのに対し、カルテは「1単位×全指標」を縦に引く
-- ＝選択した単位の素性を分野横断で集める（ADR-0011 骨組み）。
-- 静的クエリ（実行時に形が変わらない・unit_id/unit_kind は値の差し替えのみ）ゆえ sqlc 既定（backend-conventions §1.1）。
-- unit_kind を引数に取るのはメッシュ移行の継ぎ目（ADR-0015）：'municipality'↔'mesh250' を呼び分けるだけで同じ表が効く。

-- 名称・都県コードは admin_unit から（表示はコードでなく name・ADR-0014）。
-- 指標を1つも持たない単位でも「単位は実在する（カルテは空でも出す）」を判別するため、指標とは別に引く。
-- name: GetAdminUnit :one
SELECT code, name, pref_code
FROM admin_unit
WHERE code = $1
  AND unit_kind = $2;

-- 当該単位の全指標（縦持ち metric_value をそのまま縦に・ADR-0015）。
-- status/year/source も返す＝データなし3区別の表示分けと出典・推計の明示（ADR-0011/0009）に使う。
-- 並びは metric キーの安定順（表示順は FE registry が決める＝ここは決定的な順序だけ担保）。
-- name: ListUnitMetrics :many
SELECT metric, value, status, year, source
FROM metric_value
WHERE unit_id = $1
  AND unit_kind = $2
ORDER BY metric;
