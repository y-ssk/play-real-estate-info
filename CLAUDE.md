# CLAUDE.md — MachiLens（仮称）開発パートナーへの地図と行動指針

> このファイルは薄く保つ（コンテキスト層の一部品であって器の全体ではない／`docs/04_harness.md` 第1節）。
> 詳細は各ドキュメントに委譲する。下の「ドキュメント地図」のパスを、作業に応じて都度読むこと（Just-in-Time）。

---

## 進め方（壁打ちモード）
- いきなり実装しない。まず関連ドキュメントを読み、理解を要約して確認する。
- 大きな判断（アーキ・設計・スコープ・ライブラリ選定・ディレクトリ構成）は、
  選択肢を「理由＋トレードオフ＋捨てる案」付きで提示し、オーナーの決定を待つ。
- 1ブロックずつ進める。一度に全部を決め切ろうとしない。
- オーバーエンジニアリングを避ける。「本丸は手厚く、周辺は薄く」。
  本丸＝ETL・データモデリング・地図表現。周辺＝認証・UI部品・インフラ。
- 過去の経緯は判断材料であって制約ではない（「前にこうしたから」で積み上げない）。
- 壁打ちで概念を噛み砕いた解説が出たら、そのブロックの締めにオーケストレーターが `docs/notes/` へ学習メモ化して報告する（オーナーの依頼は不要。様式はスキル `record-format`）。

## 検討事項の運用（考慮漏れを取り込む仕組み）
- 新しい検討事項が出たら、その場で解決せず `docs/99_decision-register.md` に
  「項目＋トリガー（着手条件・状態ベース）」で追記し、今の作業は止めない。
- 確定した判断は `docs/99_decision-register.md` に結論を追記し、状態を「確定」に移す。
- ブロックの変わり目で「足すべき新項目はあるか」を点検する。**全量点検は二レンズ（内→外＝データ/基盤・外→内＝ユーザー導線→画面→機能）＋枠の完全性メタ点検＋スライス着手前の小ゲートで行う**（手順 `docs/04` §8・生きた全量マップは `docs/99`・`ADR-0025`）。

## 変更管理（必須）
- **仕様変更は `/spec-change` の導線で**（場当たり禁止＝形骸化の元）。正の仕様の所在は固定（スコープ=`01`／画面・UX=`05`／UI・部品=`DESIGN`＋`web/src/components`／データ=`02`／決定・スライス=`99`／凍結根拠=`adr/`）。仕様を変えたら**該当する正を更新し背景を残す**。層4レビューの指摘は PR コメントに記録し、仕様判断は `/spec-change` へ通す。
- コード変更時は、関連する仕様文書・ADR・必要なら学習メモを同じ変更で更新する
  （コードだけ・文書だけの更新は禁止。根拠と実態を常に一致させる）。
- 変更ごとに意味のある最小単位でコミットし、メッセージに「なぜ」と関連ADR番号を書く。
- コミットは ADR 番号を「記録:」行に紐づける。様式は `docs/commit-pr-format.md`（スキル `commit-pr-format`）、
  ADR・学習メモは `docs/records.md`（スキル `record-format`）。
- ブランチは **feature → dev → main**。`main`・`dev` は保護線（**直接 commit/push 禁止**。`ADR-0003`）。
  作業は feature ブランチで行い、まとまりごとに `dev` へ PR。
- feature への commit/push・PR 作成は**都度許可なく可**。**`feature→dev` の取り込み（merge）は AI が実行可**（PR→マージ→ブランチ整理まで）。**`dev→main` の取り込みはオーナーが承認/実行**（`ADR-0003` 更新）。

---

## ドキュメント地図（必要時に読む／`@import` はしない＝常時ロードを避ける）
- `docs/01_project-overview-scope.md` … プロダクト概要・スコープ（やる/やらない/保留）
- `docs/02_architecture.md` … アーキテクチャ・データ仕様（MLIT振り分け・ETL要件）
- `docs/05_screens-and-flows.md` … 画面・機能・遷移（UX/情報設計の柱・全量マップE2）。機能一覧/画面一覧/遷移図/トップ=入口ハブ/画面別MVP割付。**UI実装の見取り図**（`ADR-0025` 外→内レンズ）
- `docs/backend-conventions.md` … BE実装/レビューのお作法（生きた文書）。クエリ層・lint・テスト/カバレッジ・doc。**BE/ETL実装時・レビュー時に参照**（ADRは凍結の根拠・最新取り決めは本書）
- `docs/frontend-conventions.md` … FE実装/レビューのお作法（生きた文書）。ディレクトリ/依存・型安全・状態・melta-ui使い方・出典欠損・doc・lint・テスト/カバレッジ・レビュー観点。**FE実装時・レビュー時に `DESIGN.md` と並べて参照**（視覚はDESIGN・実装は本書）
- `DESIGN.md` … UI憲法（melta-ui取り込み＋固有差分）。FE役が最初に読む
- `docs/04_harness.md` … AI駆動の進め方（役割・Feedback4層）
- `docs/99_decision-register.md` … 決め事の台帳（確定の索引・保留のトリガー）
- `docs/00_claude-code-kickoff.md` … 立ち上げ手順（Step A〜E）
- `docs/commit-pr-format.md` … コミット/PR 様式の入口（実体はスキル `commit-pr-format`）
- `docs/records.md` … 記録様式(ADR・学習メモ)の入口（実体はスキル `record-format`。ADR=`docs/adr/`, 学習メモ=`docs/notes/`）
- `docs/runbooks/` … 運用手順（手作業のパッチ適用的処理の手順書・第4の種別）。例 `n03-ingest.md`（N03投入）。**手作業の運用を回す時に参照**（`ADR-0024`）
- `docs/api-if-spec/` … 各MLIT APIのIF定義集（1API1ファイル）。`_paste.md` に貼り→`/if-spec` で構造化。実装前に必ず確認
- `prompts/` … セッション再開の仕組み。`_resume.template.md`(固定枠・tracked)＋`resume.md`(現在地・local)。再開=1行貼付で `resume.md` を読む、更新=スキル `/checkpoint`。権威は `docs/99`
- `docs/ai-feedback.md` … オーケストレーター（私）のフィードバック・学習ログ（**仕様ではない・可視化用**）。状態主張は出典確認後、推測で断言しない等。私のメモリの鏡
- `docs/glossary.md` … 用語辞書（**local・gitignore**。無ければ新規作成）。**言葉づかいルール＝英語由来用語は日本語の定訳を優先し直訳借用語を使わない／初出の専門語は1行で言い換え**。判断した「避ける語/正しい語」をここに蓄積
- `melta-ui/` … 取り込んだデザイン仕様書（components/foundations/tokens）

---

## 秘匿情報（APIキー）— AIは参照禁止（ハードルール）
- **AI（あなた）は APIキーを、いかなる経路でも参照・探索・表示してはならない。** 断固禁止:
  - `~/.config/config.env`（実キーの置き場）を **読まない・開かない・`cat`/`grep`/`source` しない・編集しない**。
  - `~/.bashrc` 等を含め、**どのファイル・プロセス環境からもキーを拾いに行かない**。
  - `MLIT_API_KEY` の **値を表示・ログ出力・コミットしない**（`echo $MLIT_API_KEY`、`env`/`printenv` での値確認も禁止）。
  - 必要なら値を出さず存在確認のみ可（`[ -n "$MLIT_API_KEY" ] && echo set`）。それ以外は **オーナーに依頼**する。
- 機械的担保: `.claude/settings.json` の deny で上記ファイルの Read/Edit を遮断済み。
- 設計: キーは `~/.config/config.env` に `export MLIT_API_KEY="..."` で置き、`~/.bashrc` から `source` する。
  **BE(Goアプリ)は環境変数 `MLIT_API_KEY` 経由でのみ参照**する。設定/更新手順は `README.md`。
- 暗号化コミット方式（sops+age）への昇格は将来枠（`docs/99_decision-register.md`）。

## 役割（2役発進・Step C 確定）
- PO ↔ **メイン＝オーケストレーター**（このスレッド）。実装と検証をサブエージェントへ委譲する。
- **実装役** = サブエージェント `implementer`（`.claude/agents/implementer.md`）。BE/ETL は `docs/02`、FE は `DESIGN.md` を読む。
- **レビュー/検証役** = サブエージェント `reviewer`（`.claude/agents/reviewer.md`。読取専用＋test/lint実行・改変不可）。
  Feedback 層1（データの正しさ）を最優先で検証。層2 は `/code-review` に委譲。
- サブエージェントは CLAUDE.md を継承しないため、各 system prompt 冒頭で必要な docs を自分で読む
  （役割別にコンテキストを絞る＝`docs/04` 第3節）。
- 将来の第1細分化（実装役→BE/ETL＋FE）は「2役が安定稼働後」（`docs/99`）。今は作らない。
