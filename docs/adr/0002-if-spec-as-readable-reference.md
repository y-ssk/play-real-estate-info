# ADR-0002: MLIT API の IF 定義は「読む参照(md)」として持つ（OpenAPI/codegen は不採用）

- ステータス: 承認
- 日付: 2026-06-23
- 関連: `docs/api-if-spec/` / `docs/02_architecture.md` 第3節 / `99_decision-register.md`「各MLIT APIのIF定義の最終確認」

## なぜ（背景・課題）
各 MLIT API の IF 定義を取り込むにあたり、成果物の形式（md / OpenAPI / codegen / JSON Schema）を決める必要がある。
「憶測でクライアントを書かない」を担保しつつ、本丸（ETL・データモデリング・層1検証）に労力を集中したい。

## 結論（決定）
IF 定義は `docs/api-if-spec/<ID>.md` に「**読む参照**」として持つ（1API1ファイル）。
人間が公式からコピペ → AI が `_TEMPLATE.md` の形に構造化（転記のみ・憶測しない・欠けは「未確認」）。
Go の型・string→型付き変換・値域/欠損検証は、自動生成せず **ETL コード（本丸）に手書き**で残す。
レスポンス検証は OpenAPI でなく Go test（層1）で担保する。

## 検討した代替案と捨てた理由
- **OpenAPI yml + codegen**：MLIT レスポンスは全フィールドが文字列型で、生成物は「全部 string の構造体」。
  本丸の string→型付き＋検証＋PostGIS モデリングを肩代わりせず、手書き OpenAPI の手間だけ増える。
  設計メモ（取り込み観点）も載らない → 不採用。
- **JSON Schema で検証契約**：スキーマ管理の周辺コスト。層1検証は Go test で足りる → 不採用。
- **Go struct を codegen**：同上（全 string）。設計判断を本丸コードに残す方針と相反 → 不採用。

## 影響（結果・トレードオフ）
- 成果物は md。機械可読契約は持たないため、型/検証は人手（ETL コード）＝本丸を厚くする狙いと一致。
- 自前で公開する API（`cmd/api`）の文書化に OpenAPI を使うかは別問題。必要になれば将来検討（`99`「API設計方針」）。
