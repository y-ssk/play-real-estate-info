# 運用手順（runbook）: 将来人口増減率(2020→2050) の取得・投入（XKT013）

> 将来推計人口250mメッシュ(XKT013) を PostGIS へ取り込み、市区町村ごとの**人口増減率**（ΣPTN_2050/
> ΣPTN_2020−1）を `metric_value(metric='pop_change_rate_2020_2050')` へ書き込む逐次手順。**人が手で
> 流すパッチ適用的な処理**（cron 等の自動バッチではない・ADR-0024）。設計の正本＝`ADR-0009`（将来人口
> 指標の定義・推計明示）／`ADR-0011`（データなし3区別・分母0=none・出典）／`ADR-0014`（値域＝上2桁）／
> `ADR-0015`（メッシュ→単位集計）／`ADR-0030`（タイル指標のエリア・パラメータ化＝波）。IF 定義＝
> `docs/api-if-spec/XKT013.md`。お作法＝`docs/backend-conventions.md` §5.3。
>
> この文書は**運用手順**（ADR・お作法・学びとは別の第4種別）。地価（XPT002）と同じ骨格
> （`docs/runbooks/xpt002-ingest.md`）＝タイル範囲は tilegrid で算出・fetch は薄く・集計は Go。

## この手順でやること

```
取得    対象エリア(pref)の bbox から z=11 タイル範囲を go が算出 → XKT013 を pref ごとにスイープ取得し
        data/xkt013/{VINTAGE}/{PREF}/z11_{x}_{y}.geojson へ保存（scripts/fetch-xkt013.sh）
投入    タイル群をストリーム抽出（MESH_ID/SHICODE/PTN_2020/PTN_2050 のみ）→ MESH_ID 重複排除
        → 対象 1都3県フィルタ（SHICODE 上2桁）
集計    SHICODE ごとに ΣPTN_2020/ΣPTN_2050 → 増減率 ΣPTN_2050/ΣPTN_2020−1（空間結合不要＝メッシュに
        SHICODE が付く）→ 対象 pref 全単位を present/none で埋める（分母0・未取得=none・ADR-0011）
検証    pref 別の件数（present/none）・増減率（min/max）・東京の既存値が不変かを確認（層1・アサートも自動）
```

投入・集計は `go run ./cmd/ingest -metric=pop_change_rate_2020_2050 -data=data/xkt013/<VINTAGE>` の1コマンド。

---

## 0. 前提

- **DB が起動済み**（PostGIS）・**1都3県の admin_unit が投入済み**（`docs/runbooks/n03-ingest.md` 波1）。
  タイル範囲算出（`-tiles`）は admin_unit の `ST_Extent` を引くため、N03 が先。
- **DB 接続情報**（`POSTGRES_*`）と **`MLIT_API_KEY`** が `~/.config/config.env` に載り source 済み。
  スクリプトは self-source する（鍵の値は端末・ログ・履歴に出さない・CLAUDE.md 秘匿）。

## 1. 取得（scripts/fetch-xkt013.sh）

```bash
scripts/fetch-xkt013.sh 2050   # 既定 2050・対象エリア=1都3県（13/11/12/14）
```

- タイル範囲は決め打ちせず `cmd/ingest -tiles -pref=<PREF> -z=11` が bbox→z/x/y を算出する
  （`internal/tilegrid`＝地価 XPT002 と共有する汎用ヘルパー・ADR-0030 継ぎ目b）。**東京(13)は本土 bbox
  を明示**（`tilegrid.PrefBBoxOverride`。島嶼まで ST_Extent で取るとタイルが爆発。島嶼は面塗り MVP 対象外
  ＝データなし扱い）。他県は admin_unit の ST_Extent。
- z=11（IF §2「11（市）」）＝市区町村集計に十分な最小ズームでタイル枚数を抑える。
- レート制御：1タイルごとに小休止（XKT013 は1タイル ~29MB と重い＝控えめに）。
- **冪等**：同名で上書き保存。`data/` は `.gitignore`。

## 2. 投入・集計（cmd/ingest）

```bash
go run ./cmd/ingest -metric=pop_change_rate_2020_2050 -data=data/xkt013/2050
```

- `-data` は VINTAGE ルート（`data/xkt013/<vintage>`）を指す。pref サブディレクトリを再帰探索する
  （地価と同流儀）。
- 年次は `PTN`（秘匿なし生値・全年そろう）を使う。`year` 列＝推計到達年 2050（版の意味）。
- **冪等**：`metric='pop_change_rate_2020_2050'` を DELETE→INSERT（何度流しても同結果）。
- **実行後アサート**（層1・失敗はロールバック）：投入>0／present>0／対象 1都3県 以外の混入0／status↔value
  整合／率が -1<率≤10 の常識的範囲／**サンプル中央区(13102)が +24.7% 近傍**（集計取り違え検出）。

## 3. 検証（層1・psql）

```bash
# pref 別の件数（present/none）と増減率の値域。3県の穴（データなし）が埋まり present が付くこと・
# 東京(13)の present/none 件数と増減率が波p 前と不変であることを確認する。
psql ... -c "
SELECT left(unit_id,2) AS pref,
       count(*) FILTER (WHERE status='present') AS present,
       count(*) FILTER (WHERE status='none')    AS none,
       round(min(value) FILTER (WHERE status='present')::numeric,3) AS min_rate,
       round(max(value) FILTER (WHERE status='present')::numeric,3) AS max_rate
FROM metric_value WHERE metric='pop_change_rate_2020_2050'
GROUP BY left(unit_id,2) ORDER BY pref;"

# 増加が大きい順・減少が大きい順のサンプル（都心再開発区が増・郊外/山間が減＝傾向の妥当性）。
psql ... -c "
SELECT mv.unit_id, au.name, round(mv.value::numeric,3) AS rate
FROM metric_value mv JOIN admin_unit au ON au.code=mv.unit_id AND au.unit_kind=mv.unit_kind
WHERE mv.metric='pop_change_rate_2020_2050' AND mv.status='present'
ORDER BY mv.value DESC LIMIT 5;"
```

## 波（エリア拡張・ADR-0030）

対象エリアを広げるときは、`internal/ingest/metric_pop_change.go` の `popChangePrefixes` と
`scripts/fetch-xkt013.sh` の `PREFS` に pref を足し（島嶼を持つ県は `tilegrid.PrefBBoxOverride` に本土
bbox を検討）、取得→投入を流し直すだけ（コードの本体は触らない＝タイルグリッド継ぎ目が汎用ゆえ）。
