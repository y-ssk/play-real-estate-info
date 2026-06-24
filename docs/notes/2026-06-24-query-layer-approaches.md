# PostGIS×Go のクエリ層：4方式とハイブリッド (2026-06-24)

## 学んだこと

同じ題材（`ADR-0016` の値取得 `/values?metric=` ＋ `ADR-0015` の縦持ち表 `metric_value`）で4方式を並べると違いが見える。用語：**定型コード**＝毎回ほぼ同じ繰り返し（Scan等）。**コード生成**＝ビルド前に道具がGoコードを自動で吐く。**引数化（`$1`）**＝値をSQL文に直接埋めず別渡し（打ち込み攻撃を防ぐ）。

### ① 生SQL（pgx に直書き）
SQL文字列を自分で書き、結果を1行ずつ手で構造体へ詰める。間に何も挟まない。
```go
const q = `SELECT unit_id, value_num, data_status FROM metric_value
           WHERE metric_key=$1 AND unit_kind='city' AND left(unit_id,2)=$2`
rows, _ := s.pool.Query(ctx, q, metric, pref)
defer rows.Close()
for rows.Next() {
    var mv MetricValue
    rows.Scan(&mv.UnitID, &mv.ValueNum, &mv.DataStatus) // 列順と一致必須
    out = append(out, mv)
}
```
- 利点：SQLが全部見える（学習で最良）／PostGIS関数も自由／依存最小。
- 欠点：`Scan` の順番・型を手で合わせる定型コード／**列名typo・型ズレは「実行して」初めて気づく**（ビルドは通る）。
- 補足：pgx v5 の `pgx.CollectRows(rows, pgx.RowToStructByName[T])` で手Scanは減らせる。ただし「SQL文字列と構造体の整合はビルド時に保証されない」点は残る。

### ② sqlc
SQLを `.sql` に書く→ `sqlc generate`（ビルド前の道具）がスキーマと突き合わせ**型安全なGoコードを自動生成**。SQLは自分のもの、型チェックは生成時。存在しない列を書けば生成時に失敗＝動かす前に分かる。マイグレ生SQL（`ADR-0013`）と相性が良い（同じSQLが正）。
```sql
-- name: GetMetricValues :many
SELECT unit_id, value_num, data_status FROM metric_value
WHERE metric_key=$1 AND unit_kind='city' AND left(unit_id,2)=$2;
```
```go
rows, _ := s.q.GetMetricValues(ctx, "flood_ratio", "13") // 引数・戻り型はコンパイル時に検査済み
```
- 利点：**型安全**（列名・型・引数の不一致をビルド前に検出＝層1の土台が硬い）／Scanの定型コードが消える／SQLは自分で書くのでPostGIS関数OK・学びになる／実行時の追加依存なし（単一バイナリ維持）。
- 欠点：`sqlc generate` の手順を組む／**動的WHEREが苦手**（静的SQL前提）／生のgeometry列は型override設定が要る（`ST_AsGeoJSON`=text・`ST_AsMVT`=bytea は素直）。

### ③ クエリビルダ（squirrel 等）
SQLを文字列でなく**Goのメソッド連結で組み立てる**道具。可変条件の動的クエリに強い。
```go
b := sq.Select("unit_id").From("metric_value").
    Where(sq.Eq{"unit_kind":"city"}).PlaceholderFormat(sq.Dollar)
for _, c := range conds { b = b.Where("metric_key=? AND value_num "+c.Op+" ?", c.Metric, c.Threshold) }
sql, args, _ := b.ToSql()
```
- 利点：**動的な条件組み立てが安全**（手連結より引数化が楽）。
- 欠点：PostGIS関数に対応メソッドが無く結局文字列埋め込み→旨みが減る／静的には冗長／型安全は弱い（Scan別途）／道具の学習コスト。
- 注意：縦持ち表での「複数指標にまたぐ動的絞り込み」は `EXISTS`/`HAVING` 構成になり、**どの道具でも一定ややこしい**＝道具選び以前の設計論点（実装着手時に詰める）。

### ④ ORM（gorm/ent）＝不採用
表を構造体に対応付けSQLを書かずに済むのが売り。だが geometry を素直に扱えず `ST_*` は raw 埋め込みで意味が薄れる／自動マイグレはPostGIS拡張・GiST索引・SRIDで不都合（`ADR-0013`既決）／SQLが隠れ学びが薄くチューニングしにくい。本丸（データ正しさ・空間クエリ）と噛み合わない。

### ⑤ ハイブリッド（採用＝`ADR-0017`）
部品の組み合わさり方：**pgx**＝接続の土台（全方式が乗る）。**sqlc**＝静的クエリ（大多数）を型安全に（内部でpgxを呼ぶ）。**生SQL(pgx直)**＝動的な絞り込み1系統だけ。同じ `internal/store/` で同一プールを共有。
```go
type Store struct {
    pool *pgxpool.Pool // 土台（両方が共有）
    q    *db.Queries   // sqlc 生成（静的）
}
func (s *Store) Karte(ctx context.Context, unitID string) ([]db.KarteRow, error) {
    return s.q.GetKarte(ctx, unitID)               // 静的 → sqlc
}
func (s *Store) FilterUnits(ctx context.Context, conds []Cond) ([]string, error) {
    sql, args := buildFilterQuery(conds)            // 動的 → 生SQL（同じ pool）
    rows, err := s.pool.Query(ctx, sql, args...)
    /* ... */
}
```
線引き：**条件が固定＝sqlc／可変＝生SQL／大量投入＝`CopyFrom`**。

## なぜ重要 / どこで効く
- 静的が多数の本件では、sqlc の型安全（列名・型をビルド前に検査）が**層1＝データの正しさ**の土台を硬くする。動的1系統だけ生SQLに逃がせば sqlc の弱点を回避できる。
- ORMを退けるのは、空間型・自動マイグレ・学び・チューニングのすべてで本丸と噛み合わないため（`ADR-0013` の延長）。
- お作法（既定＋3例外・アンチ/デザインパターン・テスト粒度・レビュー5問・例外台帳）は**生きた文書** `docs/backend-conventions.md` §1 に置き、実装役・レビュー役が毎回参照する。ADR は凍結記録で参照先にしない。

## 関連（ADR・コード・docs）
- `ADR-0017`（クエリ層＝pgx・sqlc既定・生SQL例外・ハイブリッド）／お作法の最新＝`docs/backend-conventions.md` §1
- `ADR-0013`（一体型・マイグレ生SQL・ORM不採用）／`ADR-0015`（縦持ち`metric_value`）／`ADR-0016`（配信の形）／`ADR-0012`（絞り込み＝動的）
- `docs/02_architecture.md` §6 バックエンド構成
