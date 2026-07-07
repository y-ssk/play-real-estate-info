# 運用手順（runbook）: 洪水浸水想定区域の該当面積率 の取得・投入（XKT026）

> 国土数値情報 洪水浸水想定区域（想定最大規模）のポリゴン(XKT026) を PostGIS へ取り込み、区に重なる浸水
> 面積の**該当面積率(%)** を市区町村ごとに `metric_value(metric='flood_area_coverage_rate')` へ書き込む逐次
> 手順。**人が手で流すパッチ適用的な処理**（cron 等の自動バッチではない・ADR-0024）。設計の正本＝
> `ADR-0006`（災害＝該当面積率）／`ADR-0015`（ポリゴンは交差面積按分）／`ADR-0014`（座標系6668・geography 面積）
> ／`ADR-0011`（データなし3区別・出典）／`ADR-0032`（浸水＝青）／`ADR-0030`（タイル指標のエリア・パラメータ化）。
> IF 定義＝`docs/api-if-spec/XKT026.md`。機能設計＝`docs/notes/2026-07-05-flood-etl-design.md`。概念＝
> `docs/notes/2026-07-05-disaster-area-rate-etl.md`。お作法＝`docs/backend-conventions.md` §5/§5.1。
>
> この文書は**運用手順**（ADR・お作法・学びとは別の第4種別）。

## この手順でやること

```
取得    対象エリア(pref)の bbox から z=14 タイル範囲を go が算出 → 浸水域ポリゴンをスイープ取得し
        data/xkt026/{YEAR}/{PREF}/z14_{x}_{y}.geojson へ保存（scripts/fetch-xkt026.sh）
投入    タイル群をストリーム抽出（Polygon の geometry だけ只取り）→ 一時テーブル flood_poly(6668) へ COPY
        → GiST 索引（重複排除はせず SQL の ST_Union に委ねる）
集計    admin_unit ポリゴンへ ST_Union(ST_Intersection(...))::geography ÷ 区面積 × 100 ＝該当面積率(%)
        （交差面積按分・ADR-0015）→ 対象 pref 全単位を present で埋める（交差ゼロは 0%・present＝ADR-0011）
検証    pref 別の件数・値域（0〜100%）・沿岸/大河川沿い高・内陸低の傾向を確認（層1・実行後アサートも自動で走る）
```

投入・集計は `go run ./cmd/ingest -metric=flood_area_coverage_rate -data=data/xkt026/<YEAR>` の1コマンド。

---

## 0. 前提

- **DB が起動済み**（PostGIS）・**1都3県の admin_unit が投入済み**（`docs/runbooks/n03-ingest.md` 波1）。
  タイル範囲算出（`-tiles`）は admin_unit の `ST_Extent` を引くため、N03 が先。
- **DB 接続情報**（`POSTGRES_*`）と **`MLIT_API_KEY`** が `~/.config/config.env` に載り source 済み。
  スクリプトは self-source する（鍵の値は端末・ログ・履歴に出さない・CLAUDE.md 秘匿）。
- **取得が重い**：XKT026 は z=14〜15 のみ配布（低ズームで粗く取る逃げ道が無い）。1都3県 z=14 で約 6960 枚
  ＝レート制御込みで約1時間（設計 note §8）。まず東京だけで層1を固め、次に 1都3県へ広げるのが安全。

## 1. 取得（scripts/fetch-xkt026.sh）

```bash
# まず東京(13)だけで層1を固める（少数で面積率の正しさを確認）。
PREFS_OVERRIDE="13" scripts/fetch-xkt026.sh 2024

# 層1が固まったら 1都3県すべて（13/11/12/14）を取得（約6960枚・約1時間）。
scripts/fetch-xkt026.sh 2024
```

- タイル範囲は決め打ちせず `cmd/ingest -tiles -pref=<PREF> -z=14` が bbox→z/x/y を算出する
  （`internal/tilegrid`＝地価/人口と共有の汎用ヘルパー・ADR-0030 継ぎ目b）。**東京(13)は本土 bbox を明示**
  （`tilegrid.PrefBBoxOverride`。島嶼まで ST_Extent で取ると z=14 で爆発する）。他県は admin_unit の ST_Extent。
- **空タイル（浸水域なし）は保存しない**（枚数が多くディスクを食うため features 空なら消す）。
- レート制御：1タイルごとに小休止（連続で叩かない）。`PREFS_OVERRIDE` で pref を絞れる（東京だけ等）。

## 2. 投入・集計（cmd/ingest）

```bash
go run ./cmd/ingest -metric=flood_area_coverage_rate -data=data/xkt026/2024
```

- `year`（版年）は `-data` 末尾（`data/xkt026/<year>`）から取る（取得物と投入年を食い違わせない）。
- **冪等**：`metric='flood_area_coverage_rate'` を DELETE→INSERT（何度流しても同結果）。TEMP は ON COMMIT DROP。
- **永続テーブルは作らない**（塗り絵＝生ポリゴンレイヤーは別スライス。本スライスは集計＝面積率のみ・一時テーブル）。
- **重い**：浸水ポリゴンは東京だけで約74.7万件。1タイルずつ COPY（メモリ ~160MB）→ 区ごとに
  `ST_Union(ST_Intersection(...))` の交差面積按分。東京は投入込みで **約10分**（うち集計 ~6.5分）、
  1都3県は数十分。`cmd/ingest` の締め切りは **30分**（他指標は数秒ゆえ無害）。途中失敗は冪等ゆえ流し直せる。
- **GEOS 堅牢化**：`ST_Union`/`ST_Intersection` に `gridSize=1e-9` を与える（GEOS 3.9 の非決定的な
  `TopologyException: Ring edge missing` を精度モデル overlay で回避。値は不変・設計note §6「実装で足した堅牢化」）。
- **実行後アサート**（層1・失敗はロールバック）：投入>0／present>0／対象 pref 以外の混入0／status↔value 整合／
  source 非空／**全行 0≤value≤100**（100超は ST_Union 結合漏れ＝分割ポリゴンの二重計上・R1 破綻）。

## 3. 検証（層1・psql）

```bash
# pref 別の件数（present/none）と該当面積率の値域（%）。0〜100 に収まること（100超は結合漏れ）。
psql ... -c "
SELECT left(unit_id,2) AS pref,
       count(*) FILTER (WHERE status='present') AS present,
       count(*) FILTER (WHERE status='none')    AS none,
       min(value) FILTER (WHERE status='present') AS min_pct,
       max(value) FILTER (WHERE status='present') AS max_pct
FROM metric_value WHERE metric='flood_area_coverage_rate'
GROUP BY left(unit_id,2) ORDER BY pref;"

# 高い順のサンプル（大河川沿い・低地・沿岸の区が上位＝傾向の妥当性）。内陸台地の区は 0% 近くが妥当。
psql ... -c "
SELECT mv.unit_id, au.name, round(mv.value::numeric, 1) AS pct
FROM metric_value mv JOIN admin_unit au ON au.code=mv.unit_id AND au.unit_kind=mv.unit_kind
WHERE mv.metric='flood_area_coverage_rate' AND mv.status='present'
ORDER BY mv.value DESC LIMIT 10;"

# 座標系が6668で一貫しているか（区側 admin_unit も6668。違う番号が混じると交差がずれる）。
# ※ flood_poly は一時テーブル（ON COMMIT DROP）ゆえ投入後は残らない＝この確認は投入 SQL 内の
#   ST_SetSRID(...,6668) と admin_unit の SRID で担保される（`SELECT DISTINCT ST_SRID(geom) FROM admin_unit;`）。
```

## 波（エリア拡張・ADR-0030）

対象エリアを広げるときは、`internal/ingest/metric_flood_coverage.go` の `floodPrefixes` と
`scripts/fetch-xkt026.sh` の `PREFS` に pref を足し（島嶼を持つ県は `tilegrid.PrefBBoxOverride` に本土
bbox を検討）、取得→投入を流し直すだけ（コードの本体は触らない＝タイルグリッド継ぎ目が汎用ゆえ）。
