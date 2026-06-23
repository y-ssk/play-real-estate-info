# api-if-spec — MLIT API の IF 定義集

各 MLIT API の IF 定義（リクエスト/レスポンスのスキーマ）を **1 API 1 ファイル**で転記・構造化する場所。
「憶測でクライアントを書かない／実装前に公式 IF を必ず確認する」を仕組みで担保する（`docs/02` 第3節注記、`docs/99`）。

## 目的（何のためか）
実装役・レビュー役が「憶測せず」コードを書くための **読む参照**＋設計メモの置き場（用途＝P1）。
機械可読契約（OpenAPI/codegen）は採らない（MLIT レスポンスが全 string で旨みが薄く、設計判断は本丸に残すため）。
Go の型・変換・値域/欠損検証は **本丸の ETL コードに手書き**で残す。
→ 決定の経緯は `docs/adr/0002-if-spec-as-readable-reference.md`。

## 使い方（仕組み）— 専用ファイルに貼って `/if-spec`
1. 公式ページから IF 定義を**そのままコピペ**する（整形不要）。
2. **`docs/api-if-spec/_paste.md`**（gitignore 対象の貼り付け用ファイル）を開き、
   `API_ID:` 欄と `--- PASTE BELOW THIS LINE ---` 以降に貼り付ける。
3. スキル **`/if-spec`** を起動 → `_paste.md` を読み、`_TEMPLATE.md` の形に構造化して
   `docs/api-if-spec/<ID>.md` を生成し、**`_paste.md` を空に戻す**（次回そのまま再利用可）。
4. セクション5「取り込み観点」は実装着手時に埋める。実装タスクは本ファイルを参照点に構造化する（Step E）。

> **チャットへの直接貼り付けは使わない**（大きな貼り付けは `[Pasted text #N]` に置換され正確に読めないため）。
> 生コピペは `_paste.md`（コミットされない中間物）に置き、リポジトリには成果物の `<ID>.md` だけが残る。
> スキル実体: `.claude/skills/if-spec/SKILL.md`。決定の経緯（なぜ md か）は `docs/adr/0002-if-spec-as-readable-reference.md`。

## 命名・運用
- ファイル名 = API ID（`XIT001.md` / `XKT026.md` など）。`_TEMPLATE.md` は雛形（アンダースコア始まりで先頭にソート）。
- 振り分け（ETL / 両用 / タイル）の一覧は `docs/02_architecture.md` 第3節が正。本集は各 API の詳細。
