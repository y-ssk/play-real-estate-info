# バックエンド実装・レビューのお作法（生きた文書）

> **これは「最新の取り決め」を引く先。** BE/ETL の実装時・レビュー時に毎回参照する。
> 決定の経緯（なぜ）は ADR（`docs/adr/`）に凍結し、本書には書かない。**ADR は判断の根拠であって、最新の取り決めを引く先ではない**。本書は育つ前提（例外は増減する）。
> **各ルールには根拠（ADR/docs/学習メモ）を併記**する。FE は対の `docs/frontend-conventions.md`。
> 導線：`CLAUDE.md` ドキュメント地図／`.claude/agents/implementer.md`・`reviewer.md` の「最初に読む」から参照。
> 関連 ADR：クエリ層＝`ADR-0017`（採用判断）。配信＝`ADR-0016`。ルーティング＝`ADR-0020`。一体型・マイグレ＝`ADR-0013`。縦持ち集計＝`ADR-0015`。

---

## §1 クエリ層（PostGIS ↔ Go のアクセス方式）

採用方式（判断の経緯は `ADR-0017`）：**接続の土台＝`pgx`／既定＝`sqlc`／例外時のみ生SQL・大量投入は `CopyFrom`**。ORM は不採用。

### 1.1 芯：既定 sqlc ＋ 名前のつく3例外だけ生SQL

| 区分 | 方式 | 例 |
|---|---|---|
| **既定（迷ったらこれ）** | **sqlc** | 値取得 `/values`、カルテ、geometry(`ST_AsGeoJSON`)、タイル(`ST_AsMVT`)…**PostGIS関数を含む静的クエリも全部** |
| 例外1：実行時に**形が変わる**（動的WHERE・列・並べ替え） | **生SQL（pgx直）** | 比べる体験の絞り込み（可変個の条件・`ADR-0012`） |
| 例外2：**大量一括投入** | **pgx `CopyFrom`** | ETLで `metric_value`・境界を流し込む（`COPY`＝最速。sqlc外） |
| 例外3：**sqlc が表現できない構文** | 生SQL（**理由をコメント明記＋下の例外台帳に追記**） | 稀 |

**生SQLに逃がすときは、例外1〜3のどれかを言えること。** 言えないなら sqlc に戻す。

### 1.2 取り違え注意：「複雑さ ≠ 動的」

`ST_AsMVT` のような**ぎょっとする空間SQLでも、形が固定なら sqlc**。sqlc は「自分の書いたSQL」を包んで型安全な結果を足すだけで、SQL自体の読みやすさは変わらない。**逃がす基準は「複雑か」ではなく「実行時に形が変わるか」**。

### 1.3 アンチパターン（レビューで止める）

- ❌ **静的なのに生SQL** … 型安全を捨てる理由がない。→ 既定 sqlc。
- ❌ **動的条件を sqlc で無理に表現** … `WHERE ($1 IS NULL OR col = $1)` の羅列（NULL地獄）。読めない・索引が効かず遅い。→ 生SQL。
- ❌ **値を文字列連結** … `"... = '" + v + "'"` は打ち込み攻撃の穴。→ 値は必ず引数化 `$1`。**動的でも変わるのは「構造（どの条件を足すか）」だけ。値は常に引数化**。
- ❌ **クエリビルダを静的クエリに** … 型安全の利得を捨て冗長。builder は「動的が主」のとき検討で、本件は生SQLで足りる。
- ❌ **ORM 持ち込み** … 不採用（`ADR-0013`／空間型・自動マイグレに不適合）。
- ❌ **ハンドラ層にSQL** … SQLは store 層（`internal/store/`）に閉じる。

### 1.4 デザインパターン／お作法

- **SQLは `internal/store/` に集約**。ハンドラは store のメソッドを呼ぶだけ。
- **命名規則**：
  - sqlc クエリ：`-- name: <動詞><名詞> :many|:one|:exec`（例 `GetMetricValues`, `GetKarte`, `UpsertMetricValue`）。
  - store メソッド：用途名（`MetricValues`, `Karte`, `FilterUnits`）。
  - 動的SQLの組み立て関数：`build<対象>Query`（例 `buildFilterQuery`）。
- **動的生SQLは「静的な土台＋条件を足す」二段**に分け、足す条件も必ず引数化。組み立ては関数に閉じる。
- **geometry の型対応付け（override）は `sqlc.yaml` 一箇所**で設定（散らさない）。`ST_AsGeoJSON`=text・`ST_AsMVT`=bytea は素直、生の geometry 列のみ override。
- **結果型の方針は1つに**：MVPは sqlc 生成型をそのまま返す（境界で独自型に変換しない＝薄く）。漏れが気になれば後で境界変換へ昇格（可逆）。
- **sqlc 生成物はコミット**し、`sqlc generate` がいつでも再現する状態を保つ。

### 1.5 テスト粒度（層1＝データの正しさを厚く・`docs/04` 第5節）

- **方式を問わず層1必須**：空間集計・絞り込みの結果は、値域（相場が負・浸水率100%超が無い）／件数妥当性／欠損3区別（データなし/該当なし0/秘匿・`ADR-0011`）を検証。
- **動的SQL組み立て関数（`buildFilterQuery`）は単体テスト**：条件なし／単一／複数／空条件の各分岐。
- **sqlc クエリ**：`sqlc generate` の再現と、代表クエリの結果テスト。
- **粒度の目安**：store 層の各公開メソッドに最低1本（正常＋境界）。ETL は層1観点を厚く、周辺は薄く。
- **カバレッジ（根拠：`docs/notes/2026-06-25-test-coverage`）**：計測・可視化のみ（`go test -cover`・当面ゲートにしない）／**本丸（層1：ETL変換・空間集計・動的フィルタ組み立て）の分岐カバレッジを重視・周辺の%は追わない**／**差分カバレッジ（変更行が新たにテストされたか）を主signal**。CIゲート化はCI着手時に再検討。

### 1.6 レビュー5問（yes/no で通す）

1. 静的なのに生SQLになっていないか？（なら理由を問う）
2. 生SQLなら、逃がす理由は3例外のどれか言えるか？
3. 値はすべて引数化されているか（文字列連結に値が無いか）？
4. SQLは store 層に閉じているか？
5. sqlc 生成物はコミット済みで、`sqlc generate` が再現するか？

### 1.7 例外台帳（生SQLへ逃がした「例外3」を追記する欄）

> 例外1（動的）・例外2（COPY）は定型なので記録不要。**例外3（sqlcが表現できず生SQLにした）だけ、ここに日付・対象・理由を追記**。増えてきたら方式を再考する材料にする。

| 日付 | 対象（クエリ/関数） | 理由（sqlcで書けなかった点） |
|---|---|---|
| （まだ無し） | | |

### 1.8 sqlc の実運用（生成の回し方・置き場・設定の要点）

- **生成は Docker（`make sqlc-generate`）**＝host に sqlc を入れない（migrate と同じ host 無依存・再現性。`ADR-0017`）。`sqlc/sqlc` 公式イメージを `docker run --rm -v $(CURDIR):/src -w /src ... generate` で回す。DB 接続は不要（schema＝migrations の up・queries を静的解析するだけ）。
- **設定＝リポジトリ直下 `sqlc.yaml`**（`version: "2"`・`engine: postgresql`・`sql_package: pgx/v5`・`emit_json_tags: true`）。
  - **schema は `migrations/*.up.sql` のみ**を参照する。down（DROP）を混ぜると sqlc がアルファベット順に DDL を読む際に先に DROP が走り後続参照が壊れるため、up に限定する。
  - **geometry 型 override は今は不要**：配信は `ST_AsGeoJSON(...)::text`（text）経由で生 geometry 列を Scan しないため、型対応付けが要らない（クエリが生 geometry を返し始めたら `sqlc.yaml` に override を1箇所で足す＝§1.4）。
- **配信 CRS は 4326（RFC7946）**：保存は 6668（JGD2011・`ADR-0014`）だが、GeoJSON 配信時は `ST_AsGeoJSON(ST_Transform(geom, 4326))` で 4326 へ変換する。6668 のままだと `ST_AsGeoJSON` が非標準の `crs` メンバ（EPSG:6668）を吐き MapLibre 前提の RFC7946（4326・経度緯度・`crs` 無し）に反するため（座標値は 6668 と 4326 で実質同値・`ADR-0014`「配信時に変換」/`ADR-0016`）。
- **クエリは `internal/store/queries/*.sql`**（`-- name: ...` 注釈つき）。**生成物は `internal/store/`（`db.go`・`models.go`・`<file>.sql.go`）でコミット**。`store.New(pool)` で `*store.Queries` を得てハンドラへ渡す（`*pgxpool.Pool` が `DBTX` を満たす）。
- **接続プール＝`internal/db`**（`DSNFromEnv`／`NewPool`）に集約。手動側（`cmd/ingest`）と随時側（`cmd/api`）の双方が参照する共有土台で、`api → ingest` の不自然な依存を避ける。`NewPool` は起動時に `Ping` し env 未設定・DB 未起動をその場で落とす（エラーに接続情報を載せない）。

---

## §2 lint／整形（根拠：`docs/notes/2026-06-25-lint-formatter-tooling`）
- **整形＝gofmt／goimports**（Go標準・自動）。
- **lint＝golangci-lint**（多数の linter を束ねる meta-linter。govet・staticcheck・revive・errcheck 等を設定で）。
- **エクスポート識別子の doc コメント強制**（revive の exported ルール等）＝§3 と連動。

## §3 ドキュメンテーション／コメント（根拠：`docs/notes/2026-06-25-doc-comment-style`）
- **WHAT（コードを読めば分かること）は書かない。WHY（意図・非自明な理由・落とし穴）を書く。**
- **エクスポート（公開）した識別子には doc コメントを必須**＝外から使われる窓口だから。**Go の doc コメントは識別子名で始める**（`// MetricValues は…を返す`）。パッケージコメントも1つ。**内部（非公開）は doc 必須にしない（必要時に WHY のみ）**。
- **struct タグ（`json:"..."`・`db:"..."`）＝機械可読の注釈**。API 応答・sqlc/pgx の対応付けを担う。タグと実列名のずれに注意。
- 複雑なドメイン処理（空間集計の按分・コード/座標の正規化・指標算出）は **WHY ＋ ADR/学習メモへのリンク**。

## §4 ルーティング／HTTP（根拠：`ADR-0020`）

- **ルータ＝標準 `net/http` の `ServeMux`（Go 1.22+）**。外部ルータ（`chi`/`gin`/`echo`）は入れない。メソッド＋パスワイルドカード（`GET /api/tiles/{z}/{x}/{y}`）と `r.PathValue("z")` で足りる。
- **ルート登録は `cmd/api`（起動側）に集約**。ハンドラは `internal/handler/`、SQLは持たず store を呼ぶだけ（§1.4）。
- **ミドルウェアは素の `func(http.Handler) http.Handler` 合成**を手書き（薄く）。
- **可逆**：ルート増でグループ化/ミドルウェアが手書きで苦しくなったら `chi`（標準 `http.Handler` 互換）を差し込む。先回りで入れない（YAGNI）。
- **Go 1.22 以上**を前提（`go.mod` の `go` ディレクティブで固定）。

## §5 ETL／データ投入（境界 N03 など・根拠：`ADR-0022`・`ADR-0023`）

- **投入と正規化を分ける（継ぎ目）**：シェープ→PostGISテーブル化（機械的）＝外部ツール／5桁コード化・年度固定・値域チェック（本丸の結合基盤）＝**SQL・Go**。正規化は投入ツールに埋めない（ツールを替えても不変・`ADR-0015`）。投入ツール選び・置き場所が影響するのは投入工程だけで、正規化以降には波及しない。
- **ローダの置き場所＝使い捨ての別コンテナ**（`ADR-0023`）。投入時だけ GDAL 公式イメージ `ghcr.io/osgeo/gdal` から `docker run --rm` で起動し、compose と同一ネットワーク越しに DB へ流し込み、終了後に破棄する。**DB イメージ（`postgis/postgis`）は公式のまま改変しない**（攻撃面最小・再現性・役割分離）。DB イメージに同居（カスタム build）・端末直インストールは捨てた（`ADR-0023`）。
- **ローダ＝`ogr2ogr`（GDAL）**。GDAL 公式イメージに同梱で入手・保守が素直。N03 はシェープゆえ機能十分。
  **入力は GeoJSON**（N03 同梱の `.geojson`＝UTF-8・`EPSG:6668` 自己宣言ゆえ文字コード指定が不要・`.shp` の CP932 / `.prj` の Esri WKT 名を避けられる）。実装で確定した形（`scripts/ingest-n03.sh`）：
  ```bash
  docker run --rm --network=host \
    -e PGPASSWORD="$POSTGRES_PASSWORD" \
    -v "<data/n03/{YEAR}/{PREF}>:/data:ro" \
    ghcr.io/osgeo/gdal \
    ogr2ogr -f PostgreSQL \
      "PG:host=localhost port=${POSTGRES_PORT} dbname=${POSTGRES_DB} user=${POSTGRES_USER}" \
      "/data/<N03...>.geojson" \
      -nln n03_raw -overwrite -a_srs EPSG:6668 \
      -lco GEOMETRY_NAME=geom -lco SPATIAL_INDEX=GIST
  ```
  パスワードは `-e PGPASSWORD` でコンテナ環境変数に渡し**接続文字列に埋めない**（端末/`ps`/履歴に出さない）。`-a_srs EPSG:6668` は自己宣言済みの座標系を確定する目的（再投影 `-t_srs` ではない・座標値はそのまま）。`-overwrite` で冪等。入力が `.shp`（CP932）に戻る場合のみ `--config SHAPE_ENCODING CP932` を付す。`shp2pgsql` は専用イメージが乏しく自作の手間ゆえ採らない（`ADR-0023`。将来固有の事情が出れば継ぎ目で可逆）。
- **取得＝低頻度（年1回）**：直リンクの取得スクリプト（年度・都県をパラメータ）で半自動。完全自動化しない。
- **実装時に実物で確認**（憶測しない）：GDAL 公式イメージの `ogr2ogr` 同梱（`docker run --rm ghcr.io/osgeo/gdal ogr2ogr --version`）・`.prj` の座標系（→6668 変換要否）・`.dbf` の文字コード。**東京都(13)・令和5年版で確認済**＝座標系 `GCS_JGD_2011`＝EPSG:6668（保存目標と一致・再投影不要／.prj は Esri WKT名ゆえ `-a_srs EPSG:6668` で付与）・文字コード CP932・`N03_007` は5桁文字列・同梱の `.geojson` は UTF-8 で EPSG:6668 を自己宣言（入力候補）。

### §5.1 運用形態（`ADR-0024`）
- **実行手段＝薄いscript＋Makefile入口**：`scripts/ingest-n03.sh`（GDAL公式イメージを `docker run --rm --network=host` で呼ぶ薄いラッパ）／入口 `make ingest-n03`（`make migrate` と同じ流儀＝env駆動・`@`echo抑制・`source ~/.config/config.env`）。取得は対の `scripts/fetch-n03.sh`。**手打ち `docker run` は禁止**（再現性ゼロ）。
- **正規化＝Go（`cmd/ingest`）に持つ**（本丸・層1検証対象。`ADR-0017`）。`n03_raw`（生・無加工）→ `admin_unit`（5桁集約・年度固定・値域）。psql で SQL を流す案は層1をテストで守れず却下。
  - 実装＝`internal/ingest`（正規化本体）＋`cmd/ingest`（`-year`/`-pref` フラグの入口）。接続は `POSTGRES_*` 環境変数から DSN を組む（§1・compose/Makefile と同一変数。パスワードは DSN/ログに出さない）。
  - **正規化SQLは生SQL（pgx 直）＝§1 例外3**：対象 `n03_raw` は `ogr2ogr` が動的に作る一時テーブル（属性そのまま・大文字列名 `N03_007`/`N03_004`）でスキーマ管理外ゆえ sqlc が扱えない（理由を `internal/ingest` のパッケージ doc に明記）。形は固定（`N03_007` で `GROUP BY`・`ST_Multi(ST_Union(geom))`）。値は必ず引数化（pref＝`$1`）。
  - 表示名(name)＝`N03_004`（千代田区 等）をそのまま（政令市の区の組み立ては9都県化で対応＝今回対象外・`ADR-0024`）。
  - **実行後アサート（層1）**：投入件数>0／全 code が5桁／全 geom が `ST_IsValid`／サンプル名（13101=千代田区・在れば）が日本語で文字化けしていないこと。失敗はロールバックし文脈付きで返す。
  - **件数の妥当性（東京都=69）**：元 GeoJSON 6177 ポリゴンを `N03_007`(5桁) で束ね 69 行（23特別区＋26市＋町村＋島嶼＋`13805`/`13807`/`13808` 等の行政界コードを含む）。検証クエリは `docs/runbooks/n03-ingest.md` §3。
- **データ配置規約＝`data/n03/{YEAR}/{PREF}/`**：`fetch-n03.sh` がここに展開、`ingest-n03.sh` はここから読む（path は YEAR/PREF で一意）。`temp/` は使わない（配置を一本化＝再現性）。`data/` は `.gitignore`。
- **冪等性**（ETL要件）：`n03_raw` は投入前に `DROP`/`TRUNCATE`、`admin_unit` は**都県単位**（コード上2桁=PREF）で `DELETE`→`INSERT`。何度流しても同結果。
- **死守**：AIは `config.env` 不可触（触るのは script ファイルのみ）・**起動はオーナーの対話シェル**・パスワードは `PGPASSWORD` 経由（接続文字列に埋めない）＋echo抑制で端末/`ps`/履歴に出さない。
- **手順書＝`docs/runbooks/n03-ingest.md`**（運用手順 runbook・作成済み：前提→取得→投入＋正規化→検証→冪等→つまずき）。README はローカルセットアップに導線1行。入口＝`make fetch-n03` / `make ingest-n03`（対象は `N03_YEAR`/`N03_PREF` で上書き・既定 2023/13）。
- 詳細解説＝`docs/notes/2026-06-25-n03-ingest.md`（投入工程・シェープ・SRID）／`docs/notes/2026-06-25-n03-ingest-path.md`（登場人物・流れ・ローダの置き場所）／`docs/notes/2026-06-25-n03-impl-building-blocks.md`（Go依存・シェル・使い捨てコンテナの作法）。

### §5.2 縦持ち集計値（metric_value）と値配信（/values）の作法（根拠：`ADR-0015`/`0016`/`0011`）
- **集計値の置き場＝`metric_value`（縦持ち・1単位×1指標＝1行・`migrations/000003`）**。スキーマ要点は `docs/02` §8（status の3区別＋CHECK整合・year NULL の式 UNIQUE 索引・`admin_unit` への FK）。指標追加は**行追加**で済む（スキーマ変更しない・`ADR-0015`）。
- **データなし3区別は `status` 列で運ぶ**（present／none／suppressed）。**該当なし＝0 は `value=0, status=present`**（「危険ゼロ」と「未調査」を混同させない・`ADR-0011`）。`value` の NULL は status と対で（CHECK が整合を担保）。
- **指標投入＝`cmd/ingest -metric=<key>`**（取得・鍵不要で完結する派生指標の経路）。**冪等＝指標単位 `DELETE WHERE metric=$1`→`INSERT`**（pref 単位の N03 正規化とは別の冪等境界）。投入後に**層1事後チェック**（件数>0・値域：負/0・桁外れ・present なのに NULL なし）を tx 内で行い、失敗はロールバック。面積（`area_km2`）が最初の実装＝`internal/ingest/metric_area.go`。件数が数百で `CopyFrom` を要さないため `INSERT...SELECT`（pgx 直）。大量投入（実 ETL）では §1.1 例外2＝`CopyFrom` を使う。
- **値配信の応答形＝`[{code, value, status}]`**（`setFeatureState` 向け）。**`value` は null 可ゆえ Go では `*float64`**（`pgtype.Float8.Valid` を見て nil/値に変換）＝JSON で `null`/数値が出て FE が status と合わせて色抜きを判定できる。組み立ては純関数 `buildMetricValues` に切り出し DB 非依存で層1テスト（`internal/handler/values.go`）。クエリは sqlc 既定 `ListMetricValues`（`(metric, unit_kind)` 引数・unit_kind 引数化はメッシュ移行の継ぎ目 `ADR-0015`）。`metric` 未指定は 400。

### §5.3 カルテ配信（/karte）の作法（根拠：`ADR-0011`/`0018`/`0009`）
カルテ（街を選ぶと出る詳細パネル）は値配信の**縦横が逆**：値配信が「1指標×全単位」を横に引くのに対し、カルテは選択した1単位の**全指標を縦に**集める（`ADR-0011` 骨組み・指標が増えれば応答 `metrics` が伸びる）。
- **応答形＝`{code, name, pref_code, metrics:[{metric, value, status, year, source}]}`**（`internal/handler/karte.go`）。指標を1つも持たない単位でも `metrics` は空配列で返す（単位は実在＝カルテは空でも出す）。
- **2クエリを sqlc 既定で**（どちらも静的＝形が変わらない・§1.1）：`GetAdminUnit`（`:one`・name/pref_code）＋`ListUnitMetrics`（`:many`・当該単位の全指標）。名称は表示用（結合はコード・`ADR-0014`）。SQL は store に閉じハンドラは呼ぶだけ（§1.4）。
- **null 可は Go ポインタで運ぶ**：`value` は `*float64`（データなし3区別＝`status` と対）、`year` は `*int32`（面積のように年度なし＝null／将来人口は推計の到達年 2050＝値・`ADR-0009`）。`source` は法的要件ゆえ常に文字列（`ADR-0011 (c)`）。組み立ては純関数 `buildKarte` で DB 非依存に層1テスト。
- **識別子は `{unit_kind, unit_id}`**（`ADR-0018`）。MVP は `unit_kind` を公開クエリに載せず内部既定 `municipality` に固定（値配信と同じ `defaultUnitKind`）＝メッシュ移行の継ぎ目（`ADR-0015`）。
- **状態コード**：`unit_id` 未指定/5桁数字でない＝**400**（形を先に弾く＝DB 往復しない）、`pgx.ErrNoRows`（単位不在）＝**404**、その他失敗＝**500**（接続情報など秘匿を漏らさない汎用文言・他ハンドラと同作法）。

### §5.3 タイル取得型の指標投入（XKT013 将来人口・根拠：`ADR-0009`/`0011`/`0014`/`0015`）
面積（admin_unit からの算出）と違い、**MLIT のタイル配信から取得したファイル群を集計して `metric_value` に書く**型。最初の実装＝将来人口増減率（`pop_change_rate_2020_2050`・`internal/ingest/metric_pop_change.go`）。
- **取得と集計を分ける継ぎ目**：取得＝`scripts/fetch-xkt013.sh`（self-source・鍵はヘッダ・`data/xkt013/{vintage}/{pref}/z{z}_{x}_{y}.geojson` へ保存・冪等・レート制御）。集計＝Go（`cmd/ingest -metric=pop_change_rate_2020_2050 -data=data/xkt013/<vintage>`＝vintage ルートを再帰探索）。fetch は薄く「取得・保存」だけ、SHICODE 集計・重複排除は Go が担う（取得ツールに集計を埋めない）。**鍵は値を端末/`ps`/履歴/ログに出さない**＝curl の `--config`（一時ファイル）でヘッダを渡す（引数に展開しない）。
- **タイルスイープ範囲は決め打ちせず tilegrid で算出**（`ADR-0030` 継ぎ目b＝地価 XPT002 と同方式）：`fetch-xkt013.sh` は対象 pref（1都3県＝13/11/12/14）ごとに `go run ./cmd/ingest -tiles -pref=<PREF> -z=11` で「z x y」を得てスイープする（`tilegrid.RangeFor` が bbox→タイル範囲。東京は `PrefBBoxOverride` で本土 bbox・他県は admin_unit の ST_Extent）。**東京の島嶼は当面対象外＝データなし扱い**（後続で area.go の設定を足すだけ）。タイルは対象外の隣県（山梨等）へはみ出す。<br>※ 波p 以前は東京 z11 グリッド x=[1814..1819] y=[804..807] を決め打ちしていたが、エリア拡張の掛け算を避けるため一般化した（`ADR-0030`・Issue #65）。tilegrid の東京本土 z11 範囲は x=[1814..1820] y=[804..807]＝旧グリッドの上位集合（東京の集計値は不変）。
- **ストリーム抽出（巨大ファイル対策）**：1タイル ~29MB・1メッシュ数百項目ゆえ全件 Unmarshal せず、`json.Decoder` のトークンで `features` 配列へ降り（`seekToFeaturesArray`・properties 並び順不定に頑健）、要素を1つずつ `Decode` して**必要4キー（`MESH_ID`/`SHICODE`/`PTN_2020`/`PTN_2050`）だけ**を持つ部分構造体に写す（他キー・geometry は Decode が読み捨て）。ファイルは1枚ずつ開いて閉じる（ハンドル・メモリを溜めない）。
- **年次は `PTN`（秘匿なし生値・全年そろう）**：`PT00` は無い年があり PTN との差は最大数人で無害（偵察で確認）。
- **重複排除＝`MESH_ID`**（隣接タイルで同一メッシュが重複）。**対象エリアフィルタ＝SHICODE 上2桁が 1都3県（13/11/12/14）に含まれる**（対象外の隣県メッシュを捨てる・`ADR-0014` 値域。対象 pref は `popChangePrefixes` で一元管理＝地価 `landPricePrefixes` と同流儀・エリア拡張は配列に足すだけ）。**集計＝SHICODE ごとに ΣPTN_2050/ΣPTN_2020−1**（空間結合不要＝メッシュに SHICODE が付くため・`ADR-0015` の重心法を要さない特例）。
- **`status` の割り当て**：率が出る＝`present`／**ΣPTN_2020=0（分母0・0除算回避）と未取得（島嶼等）＝`none`**（`ADR-0011`。メッシュ秘匿 `suppressed` とは区別＝こちらは分母不在）。**FK 担保＝admin_unit に在る SHICODE のみ INSERT**、admin_unit にあって集計に無い単位（対象 1都3県）は `none` で埋める（母集合を admin_unit の対象 pref に揃える）。`year`＝推計到達年 2050（面積の year NULL と違い版の意味を持つ）。出典に**「推計(2020→2050)」を明記**（`ADR-0009` 断定しない）。
- **層1の二段**：(1) **純関数テスト**（DB非依存）＝固定サンプルメッシュで「4キー抽出・対象 1都3県フィルタ（対象外の山梨19 を除外）・MESH_ID 重複排除・増減率・分母0=none・FeatureCollection 取り違え拒否」（`metric_pop_change_test.go`）。(2) **実行後アサート**（tx 内・失敗でロールバック）＝件数>0・present>0・全 unit_id が対象 1都3県・status/value 整合・率の値域(-1<率≤10)・**サンプル中央区(13102)が +24.7% 近傍**（偵察と全集計が一致する安定値。千代田は全集計+19.7%で基準に不適）。

## §6 以降（今後追記）

> 誤り処理・ロギング/可観測性・トランザクション境界・レート制御の作法など、BE共通のお作法が出たら本書に章を足す（同じ器に集約し、文書の乱立を防ぐ）。
> **バックログ登録済み**＝`docs/99_decision-register.md` 保留事項「BE共通お作法の章追加」（トリガー：ETL/BE基盤着手時。レート制御・冪等・ロギングは ETL 要件 `docs/02` §4 として先行）。品質観点でいずれ必要。
