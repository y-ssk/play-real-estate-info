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

## 検討事項の運用（考慮漏れを取り込む仕組み）
- 新しい検討事項が出たら、その場で解決せず `docs/99_decision-register.md` に
  「項目＋トリガー（着手条件・状態ベース）」で追記し、今の作業は止めない。
- 確定した判断は `docs/99_decision-register.md` に結論を追記し、状態を「確定」に移す。
- ブロックの変わり目で一度だけ「足すべき新項目はあるか」を点検する。

## 変更管理（必須・`docs/04_harness.md` 第8節）
- コード変更時は、関連する仕様文書・ADR・必要なら学習メモを同じ変更で更新する
  （コードだけ・文書だけの更新は禁止。根拠と実態を常に一致させる）。
- 変更ごとに意味のある最小単位でコミットし、メッセージに「なぜ」と関連ADR番号を書く。
- コミット/PR は `docs/commit-pr-format.md` を参照（様式の実体はスキル `commit-pr-format` に委譲）。
- コミット/プッシュはオーナーが指示したときだけ行う。

---

## ドキュメント地図（必要時に読む／`@import` はしない＝常時ロードを避ける）
- `docs/01_project-overview-scope.md` … プロダクト概要・スコープ（やる/やらない/保留）
- `docs/02_architecture.md` … アーキテクチャ・データ仕様（MLIT振り分け・ETL要件）
- `DESIGN.md` … UI憲法（melta-ui取り込み＋固有差分）。FE役が最初に読む
- `docs/04_harness.md` … AI駆動の進め方（役割・Feedback4層）
- `docs/99_decision-register.md` … 決め事の台帳（確定の索引・保留のトリガー）
- `docs/00_claude-code-kickoff.md` … 立ち上げ手順（Step A〜E）
- `docs/commit-pr-format.md` … コミット/PR 様式の入口（実体はスキル `commit-pr-format`。暫定）
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

## 役割別コンテキスト（Step C で設定予定）
- 2役発進（実装役＋レビュー/検証役）。FE役＝`DESIGN.md` 中心、BE/ETL役＝`docs/02` 中心。
- 役割別の遅延ロードは `.claude/rules/`（paths指定）か サブディレクトリ `CLAUDE.md` で実現する。
  具体構成は Step C（`docs/00_claude-code-kickoff.md`）で確定する。
