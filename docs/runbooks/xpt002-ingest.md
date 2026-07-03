# 運用手順（runbook）: 公的地価の中央値(住宅地) の取得・投入（XPT002）

> 地価公示・地価調査のポイント(XPT002) を PostGIS へ取り込み、住宅地の当年地価の**中央値**を市区町村
> ごとに `metric_value(metric='land_price_median')` へ書き込む逐次手順。**人が手で流すパッチ適用的な
> 処理**（cron 等の自動バッチではない・ADR-0024）。設計の正本＝`ADR-0008`（相場＝住宅地の地価中央値・
> 中央値1本）／`ADR-0015`（点:内包の空間結合）／`ADR-0011`（データなし3区別・出典）／`ADR-0030`
> （タイル指標のエリア・パラメータ化＝波）。IF 定義＝`docs/api-if-spec/XPT002.md`。お作法＝
> `docs/backend-conventions.md` §5/§5.1。
>
> この文書は**運用手順**（ADR・お作法・学びとは別の第4種別）。

## この手順でやること

```
取得    対象エリア(pref)の bbox から z=13 タイル範囲を go が算出 → 住宅地(useCategoryCode=00)を
        スイープ取得し data/xpt002/{YEAR}/{PREF}/z13_{x}_{y}.geojson へ保存（scripts/fetch-xpt002.sh）
投入    タイル群をストリーム抽出（point_id/用途区分名/当年価格/座標）→ point_id 重複排除 → 住宅地フィルタ
        → 当年価格パース（"1,210,000(円/㎡)" → 1210000）→ 一時テーブル
集計    admin_unit ポリゴンへ ST_Within（点:内包・ADR-0015）→ 市区町村ごと percentile_cont(0.5)＝中央値
        （ADR-0008）→ 対象 pref 全単位を present/none で埋める（データなし3区別・ADR-0011）
検証    pref 別の件数・値域（円/㎡）・都心高/郊外低の傾向を確認（層1・実行後アサートも自動で走る）
```

投入・集計は `go run ./cmd/ingest -metric=land_price_median -data=data/xpt002/<YEAR>` の1コマンド。

---

## 0. 前提

- **DB が起動済み**（PostGIS）・**1都3県の admin_unit が投入済み**（`docs/runbooks/n03-ingest.md` 波1）。
  タイル範囲算出（`-tiles`）は admin_unit の `ST_Extent` を引くため、N03 が先。
- **DB 接続情報**（`POSTGRES_*`）と **`MLIT_API_KEY`** が `~/.config/config.env` に載り source 済み。
  スクリプトは self-source する（鍵の値は端末・ログ・履歴に出さない・CLAUDE.md 秘匿）。

## 1. 取得（scripts/fetch-xpt002.sh）

```bash
scripts/fetch-xpt002.sh 2024   # 既定 2024・対象エリア=1都3県（13/11/12/14）
```

- タイル範囲は決め打ちせず `cmd/ingest -tiles -pref=<PREF> -z=13` が bbox→z/x/y を算出する
  （`internal/tilegrid`＝地価専用でない汎用ヘルパー・以後 pop/災害が再利用・ADR-0030 継ぎ目b）。
  **東京(13)は本土 bbox を明示**（`tilegrid.PrefBBoxOverride`。島嶼まで ST_Extent で取ると z=13 でも
  十数万タイルに爆発するため。島嶼の地価は疎・面塗り MVP 対象外）。他県は admin_unit の ST_Extent。
- 住宅地のみ取得（`useCategoryCode=00`）。`priceClassification` 未指定＝地価公示＋地価調査の両方を拾い
  点を増やして中央値を安定させる。**空タイル（地価点なし）は保存しない**（ディスク節約）。
- レート制御：1タイルごとに小休止（連続で叩かない）。1都3県 z=13 は約 2,000 枚の走査。

## 2. 投入・集計（cmd/ingest）

```bash
go run ./cmd/ingest -metric=land_price_median -data=data/xpt002/2024
```

- `year` は `-data` 末尾（`data/xpt002/<year>`）から取る（取得物と投入年を食い違わせない）。
- **冪等**：`metric='land_price_median'` を DELETE→INSERT（何度流しても同結果）。
- **実行後アサート**（層1・失敗はロールバック）：投入>0／present>0／対象 pref 以外の混入0／status↔value
  整合／中央値が 1,000〜1,000万円/㎡ の常識的範囲（都心区=数百万円・郊外町村=数千円。負・0・桁ずれを弾く）。

## 3. 検証（層1・psql）

```bash
# pref 別の件数（present/none）と中央値の値域（円/㎡）。都心を含む 13 が高く、郊外県は低めが妥当。
psql ... -c "
SELECT left(unit_id,2) AS pref,
       count(*) FILTER (WHERE status='present') AS present,
       count(*) FILTER (WHERE status='none')    AS none,
       min(value) FILTER (WHERE status='present') AS min_yen,
       max(value) FILTER (WHERE status='present') AS max_yen
FROM metric_value WHERE metric='land_price_median'
GROUP BY left(unit_id,2) ORDER BY pref;"

# 高い順・安い順のサンプル（都心区が上位・郊外が下位＝傾向の妥当性）。
psql ... -c "
SELECT mv.unit_id, au.name, round(mv.value) AS yen
FROM metric_value mv JOIN admin_unit au ON au.code=mv.unit_id AND au.unit_kind=mv.unit_kind
WHERE mv.metric='land_price_median' AND mv.status='present'
ORDER BY mv.value DESC LIMIT 5;"
```

## 波（エリア拡張・ADR-0030）

対象エリアを広げるときは、`internal/ingest/metric_land_price.go` の `landPricePrefixes` と
`scripts/fetch-xpt002.sh` の `PREFS` に pref を足し（島嶼を持つ県は `tilegrid.PrefBBoxOverride` に本土
bbox を検討）、取得→投入を流し直すだけ（コードの本体は触らない＝タイルグリッド継ぎ目が汎用ゆえ）。
