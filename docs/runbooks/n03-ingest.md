# 運用手順（runbook）: N03 行政区域データの取得・投入・正規化

> 国土数値情報 行政区域データ(N03) を PostGIS へ取り込む逐次手順。**人が手で流すパッチ適用的な処理**
> （cron 等の自動バッチではない・ADR-0024）。設計の正本＝`ADR-0024`／`ADR-0023`／`ADR-0022`、
> お作法＝`docs/backend-conventions.md` §5/§5.1。背景解説＝`docs/notes/2026-06-25-n03-ingest.md`・
> `docs/notes/2026-06-25-n03-ingest-path.md`。
>
> この文書は**運用手順**（ADR・お作法・学びとは別の第4種別）。README はローカルセットアップに導線1行のみ。

## この手順でやること

```
取得    国土数値情報サイトから N03 を直リンクで落とし data/n03/{YEAR}/{PREF}/ へ展開（make fetch-n03）
投入    GeoJSON を ogr2ogr で生テーブル n03_raw へ無加工で写す（make ingest-n03 の前半）
正規化  n03_raw を 5桁コードで束ね MultiPolygon に集約 → admin_unit（make ingest-n03 の後半・本丸）
検証    件数・サンプル名の文字化けを確認
```

投入と正規化は `make ingest-n03` の1コマンドで連続実行する（①script → ②`go run ./cmd/ingest`）。

---

## 0. 前提

- **DB が起動済み**（PostGIS コンテナ）。未起動なら起動する。
  ```bash
  make db-up      # healthy まで待つ
  make migrate    # 未適用なら（PostGIS 拡張＋空の admin_unit）。適用済みなら no-op
  ```
- **DB 接続情報が環境変数に載っている**。`~/.config/config.env` に `POSTGRES_*` を書き source 済みであること
  （README「DB 接続情報」）。確認（値は出さない）:
  ```bash
  source ~/.config/config.env
  [ -n "$POSTGRES_PASSWORD" ] && echo "DB env: set" || echo "DB env: NOT set"
  ```
- **Docker が使える**（取得は不要・投入で GDAL 公式イメージを使う）。初回は `ogr2ogr` の同梱を確認できる:
  ```bash
  docker run --rm ghcr.io/osgeo/gdal ogr2ogr --version
  ```

---

## 1. 取得（make fetch-n03）

直リンクで zip を落とし、解凍して配置規約 `data/n03/{YEAR}/{PREF}/` へ展開する。既定は**令和5年版・東京都**
（`N03_YEAR=2023`・`N03_PREF=13`）。

```bash
make fetch-n03                          # 既定 = 2023 / 13
# 別の版・県を取るとき:
make fetch-n03 N03_YEAR=2023 N03_PREF=13
```

- 配布元ページ: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2023.html
- 直リンクのパターン: `https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-{YEAR}/N03-{YEAR}0101_{PREF}_GML.zip`
- 展開後は `data/n03/2023/13/` に `.shp/.dbf/.prj/.shx/.geojson/.xml` が並ぶ（投入が読むのは `.geojson`）。
- `data/` は `.gitignore`（大きいバイナリはコミットしない・本 script で再現する）。

> 既に手元へ手動ダウンロード済みのファイル（`temp/` 等）があるなら、`make fetch-n03` を使わず
> `data/n03/{YEAR}/{PREF}/` へ置けば以降は同じ（path は YEAR/PREF から一意）。`temp/` は使わない。

---

## 2. 投入＋正規化（make ingest-n03）

```bash
make ingest-n03                         # 既定 = 2023 / 13
# 別の版・県:
make ingest-n03 N03_YEAR=2023 N03_PREF=13
```

内部の2段（`ADR-0024`）:

1. **投入** `scripts/ingest-n03.sh` … 使い捨て GDAL コンテナ（`docker run --rm --network=host ghcr.io/osgeo/gdal`）の
   `ogr2ogr` で GeoJSON を生テーブル `n03_raw` へ無加工で写す。
   - 入力＝**GeoJSON**（UTF-8・`EPSG:6668` 自己宣言＝文字化けリスク無し）。
   - `-a_srs EPSG:6668`（座標系を確定・再投影はしない）・`-overwrite`（冪等＝毎回作り直す）・
     `-lco GEOMETRY_NAME=geom`。
   - パスワードは `-e PGPASSWORD` でコンテナ環境変数に渡し、接続文字列には埋めない（端末・`ps`・履歴に出さない）。
2. **正規化** `go run ./cmd/ingest -year=YEAR -pref=PREF` … `n03_raw` を `N03_007`(5桁) で `GROUP BY` し
   `ST_Multi(ST_Union(geom))` で MultiPolygon に集約 → `admin_unit`。
   - 冪等＝`admin_unit` を **pref_code 単位で `DELETE`→`INSERT`**（9都県を順に流せる・全消しにしない）。
   - 実行後アサート（層1）＝投入件数>0／全 code が5桁／全 geom が `ST_IsValid`／サンプル名が文字化けしていないこと。
     成功すると次のようなログが出る（パスワードは出ない）:
     ```
     ingest: 正規化完了 year=2023 pref=13 投入件数=69 サンプル(code=13101 name="千代田区")
     ```

---

## 3. 検証

### 件数（東京都=69）

`make ingest-n03` のログの「投入件数」を見るのが一番早い。DB から直接確認するなら（`psql` を使える場合）:

```bash
# 件数（東京都 = 69）。psql コンテナで確認する例（接続情報は環境変数から・パスワードは PGPASSWORD）。
docker run --rm --network=host -e PGPASSWORD="$POSTGRES_PASSWORD" postgis/postgis:16-3.4 \
  psql "host=localhost port=${POSTGRES_PORT:-5432} dbname=$POSTGRES_DB user=$POSTGRES_USER" \
  -c "SELECT count(*) FROM admin_unit WHERE pref_code = '13';"
```

- **東京都=69** が正しい（23特別区＋26市＋町村＋島嶼に加え、`13805`荒川河口部・`13807`中央防波堤外側廃棄物処理場・
  `13808`所属未定地 等の N03 固有の行政界コードを含む）。元の GeoJSON は 6177 個のポリゴンだが、5桁コードで束ねて 69 行になる。

### サンプル名の文字化け

```bash
docker run --rm --network=host -e PGPASSWORD="$POSTGRES_PASSWORD" postgis/postgis:16-3.4 \
  psql "host=localhost port=${POSTGRES_PORT:-5432} dbname=$POSTGRES_DB user=$POSTGRES_USER" \
  -c "SELECT code, name FROM admin_unit WHERE code IN ('13101','13102','13201') ORDER BY code;"
```

- 期待: `13101 千代田区` / `13102 中央区` / `13201 八王子市`。**日本語が正しく見えれば文字コードは健全**
  （GeoJSON は UTF-8 ゆえ通常問題ない）。`go run ./cmd/ingest` の実行後アサートも同じ観点を自動で見ている。

---

## 4. 再適用は安全（冪等）

何度流しても同じ結果になる（`ADR-0022`/`ADR-0024` の ETL 要件）:

- `n03_raw` は `ogr2ogr -overwrite` で毎回作り直す。
- `admin_unit` は **pref_code 単位で `DELETE`→`INSERT`**＝対象県だけ入れ替える（他県の行は消さない）。

ゆえに `make ingest-n03` を再実行しても件数は変わらず、9都県を順に流していける。

---

## 4.5. エリア波の手順（対応エリアを段階拡張する・ADR-0030）

対応エリアは**段階（波 wave）**で広げる。1つの波＝「対象 pref を段階リストへ足し、既に作った
指標をその pref で再取得・再投入する」データ操作（コードは書かない）。段階リスト（正本＝`ADR-0030`・
`docs/01`§4・`docs/99`「対応エリア」）:

| 波 | 対象エリア | pref コード |
|---|---|---|
| 波1 | 1都3県 | `13`（東京・投入済）／`11`（埼玉）／`12`（千葉）／`14`（神奈川） |
| 波2 | 北関東 | `08`（茨城）／`09`（栃木）／`10`（群馬） |
| 波3 | 残り首都圏 | `19`（山梨）／`22`（静岡）＝ MVP対応エリア（首都圏9都県）完成 |
| 将来 | 全国 | 対象コードの追加のみ |

### 手順（N03／算出指標＝`area_km2` の波。pref パラメータ化済みゆえデータ操作で済む）

波に含める**各 pref** について取得→投入を流し（順不同・pref 単位で冪等）、最後に算出指標を**全件で1回**再算出する。

```bash
# 例: 波1（13 は投入済ゆえ 11・12・14 を追加）。PREF ごとに 2 コマンド。
for PREF in 11 12 14; do
  make fetch-n03  N03_YEAR=2023 N03_PREF=$PREF   # 取得＋配置（data/n03/2023/$PREF/）
  make ingest-n03 N03_YEAR=2023 N03_PREF=$PREF   # n03_raw 投入→admin_unit 正規化（pref 単位 DELETE→INSERT）
done

# 算出指標を全 admin_unit で再算出（エリア非依存＝全件再投入・波の pref だけでなく全件を作り直す）
go run ./cmd/ingest -metric=area_km2
```

- **順番**が肝：`fetch`／`ingest`（pref 単位）→ **最後に** `area_km2` 再算出（全件）。算出指標は
  admin_unit から計算するので、admin_unit が全 pref 揃ってから 1 回流せばよい（pref ごとに流し直す必要は無い）。
- **タイル取得型指標**（XKT013・地価・災害）は本手順に**含まない**。多エリア化の継ぎ目（fetch/集計の
  pref＋タイルグリッド パラメータ化）が済んでから波に載せる（`ADR-0030` 継ぎ目(b)・憶測で先に全県グリッドを作らない）。

### 検証（層1・波ごとに確認する）

```bash
# pref 別 admin_unit 件数（波の全 pref が入り、既存 pref の件数が維持されること）
#   波1 期待: 13=69 / 11=72 / 12=60 / 14=58
psql ... -c "SELECT pref_code, count(*) FROM admin_unit GROUP BY pref_code ORDER BY pref_code;"

# area_km2 が対象 pref の全 admin_unit で present（欠損 0）・値域が常識的（負/0 なし・単位 km²）
psql ... -c "SELECT left(unit_id,2) pref, count(*), min(value), max(value), sum(value)
             FROM metric_value WHERE metric='area_km2' AND status='present'
             GROUP BY left(unit_id,2) ORDER BY pref;"
```

- pref 別の `sum(area_km2)` は各都県の実面積とおおむね一致するのが健全（波1 実績＝13:約2193 / 11:約3798 /
  12:約5158 / 14:約2416 km²・公表値と一致）。ずれが大きい pref は N03 の取り違え・重複を疑う。

---

## 5. つまずきの見方

| 症状 | 見るところ |
|---|---|
| `POSTGRES_* 未設定` で止まる | `source ~/.config/config.env` を実行したか（値は表示せず set 済みか確認） |
| `n03_raw が無い` と言われる | 投入（`scripts/ingest-n03.sh`）が先に走ったか。`make ingest-n03` は①→②の順に実行する |
| `データが無い（data/n03/...）` | 先に `make fetch-n03 N03_YEAR=... N03_PREF=...` で取得・配置したか |
| ダウンロードが 404 | 配布 URL を配布ページで確認（年版で MMDD が 0101 以外だと URL が変わる・script は決め打ちしない） |
| **件数が 69 でない** | 対象 PREF を取り違えていないか／`n03_raw` に別県が混ざっていないか（`-overwrite` で作り直す）／`N03_007` の値域 |
| **サンプル名が文字化け** | 入力が GeoJSON（UTF-8）か（`.shp` を CP932 指定なしで入れていないか）。`go run ./cmd/ingest` のアサートも失敗するはず |
| `ST_IsValid` でアサート失敗 | 元データの幾何不正。件数・対象を確認し、必要なら `ST_MakeValid` の導入を検討（現状は素の `ST_Union`） |
```
