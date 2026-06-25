# ADR-0024: N03投入の運用形態（薄いscript＋Make入口／正規化＝Go／配置規約／冪等／手順書runbook）
- ステータス: 承認
- 日付: 2026-06-25
- 関連: `ADR-0023`（投入経路＝使い捨てコンテナ＋ogr2ogr。本ADRはその「どう再現可能に回すか」を具体化）／`ADR-0022`（投入機構ハイブリッド・ETL要件「冪等性」）／`ADR-0017`（クエリ層＝本丸/固定SQLはGoに持つ）／`ADR-0014`（5桁コード・SRID6668・値域）／`ADR-0015`（継ぎ目）／**お作法の最新は `docs/backend-conventions.md` §5**／`README.md`（ローカルセットアップ導線）／`docs/runbooks/n03-ingest.md`（手順書・実装時に作成）／`docs/99_decision-register.md`

## なぜ（背景・課題）
`ADR-0023` で投入経路（使い捨てコンテナ＋`ogr2ogr`）は決めたが、それを**どう再現可能に回すか**（手打ち禁止・誰がやっても同じになる手順・データの置き場・再適用の安全）は未決だった。N03 投入は cron 等の自動バッチではなく**人が手で流すパッチ適用的な処理**ゆえ、実行手段・手順書・データ配置規約・冪等性を確定する。

## 結論（決定）
- **実行手段＝薄いシェルスクリプト＋Makefile入口**。実体は `scripts/ingest-n03.sh`（GDAL公式イメージを `docker run --rm --network=host` で呼ぶ薄いラッパ）、入口は `make ingest-n03`（`make migrate` と同じ流儀＝env駆動・`@`でecho抑制・`source ~/.config/config.env`）。取得は対の `scripts/fetch-n03.sh`（直リンク→配置規約位置へ展開）。**手打ち `docker run` は再現性ゼロで却下**。
- **正規化＝Go（`cmd/ingest`）に持つ**。5桁コード化・年度固定・値域チェック・ディゾルブは本丸＝層1検証対象ゆえ、Goのテストで守れる形に（`ADR-0017` の「本丸/固定SQLはGoに持つ」と整合）。psql で SQL ファイルを流す案は薄いが層1をテストで守れないため採らない。
- **`n03_raw` 中継**：投入（生・無加工）と正規化（本丸）をテーブルで分離（`ADR-0022`/`ADR-0015` の継ぎ目・層1を目視で隔離）。
- **データ配置規約＝`data/n03/{YEAR}/{PREF}/`**。`fetch-n03.sh` がここに展開、`ingest-n03.sh` はここから読む（path は YEAR/PREF から一意に組み立て）。**`temp/` は廃止**し配置を一本化＝誰がやっても同じ場所・構造・コマンド。`data/` は `.gitignore`（大きいバイナリはコミットしない・取得scriptで再現）。
- **冪等性**（`ADR-0022` のETL要件）：`n03_raw` は投入前に `DROP`/`TRUNCATE`、`admin_unit` は**都県単位**（コード上2桁＝PREF）で `DELETE`→`INSERT`。何度流しても同結果（9都県を順に流せる・全消しにしない）。
- **手順書＝`docs/runbooks/n03-ingest.md` 新設**（ADR・お作法・学びとは別の第4種別＝**運用手順 runbook**）。`README.md` のローカルセットアップに**導線を1行**置き、逐次手順の実体は runbook に隔離（README 肥大を避ける）。

## 検討した代替案と捨てた理由
- **直接 `docker run` 手打ち** … 再現性ゼロ・履歴に残らない・接続文字列でパスワードが端末/`ps` に露出 → 却下。
- **正規化を psql ＋ SQL ファイル** … 薄いが本丸（層1）をテストで守れない。本丸ゆえ Go に持つ。
- **compose の `profiles` で投入サービス化** … 使い捨てコンテナを宣言的に表現でき魅力だが、手続き的な一回処理（取得→投入→正規化→検証）には宣言的すぎ、env 解決は結局シェルの `POSTGRES_*` 参照で同じ → **将来の可逆な格上げ先**として `docs/99` 保留に置く。
- **手順書を README 直書き** … README が膨らみ最小stub方針（`docs/99`）に反する → 導線のみ。

## 影響（結果・トレードオフ）
- 実装時の新規物：`scripts/fetch-n03.sh`・`scripts/ingest-n03.sh`・`cmd/ingest`（Go・正規化）・`docs/runbooks/n03-ingest.md`・Makefile ターゲット（`fetch-n03`/`ingest-n03`）。
- お作法（取り決め）＝`backend-conventions` §5 に配置規約・冪等・実行手段・runbook導線を反映（生きた文書）。`CLAUDE.md` ドキュメント地図に `docs/runbooks/` を配線。
- **死守事項**（`CLAUDE.md` ハードルール）：AIは `config.env` を読まない/開かない（私が触るのは script ファイルだけ）・**起動はオーナーの対話シェル**・パスワードは `PGPASSWORD` 経由で渡し接続文字列に埋めない＋echo抑制（端末/`ps`/履歴に出さない）。
- **可逆**：実行手段（script/Make）と compose 格上げは継ぎ目の外＝運用層で差し替え可。正規化（本丸）に波及しない。
