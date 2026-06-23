---
name: record-format
description: MachiLens の記録様式（ADR と学習メモ）。設計判断を残すとき(ADR)や理解を記録するとき(学習メモ)に参照し、本様式に沿わせる。コミット/PR の様式は別スキル commit-pr-format。
---

# 記録様式：ADR と学習メモ（確定・Step D）

> 参照チェーン：`CLAUDE.md` → `docs/records.md` → 本スキル。コミット/PR 様式は `commit-pr-format`。
> 方針：本丸（ETL・データモデリング・地図表現）の判断は手厚く、周辺は薄く（`docs/04`・`CLAUDE.md`）。

## ADR（Architecture Decision Record）

- 置き場：`docs/adr/NNNN-kebab.md`（1決定1ファイル、`NNNN` は4桁連番）
- 索引：`docs/99_decision-register.md` の確定行から ADR 番号で辿る（**99＝索引、adr＝詳細**）
- 書く対象：アーキ・設計・スコープ・ライブラリ・構成など「なぜそうしたか」を残す価値のある決定
- テンプレート：

```
# ADR-NNNN: <決定の一言>
- ステータス: 提案 / 承認 / 置換(→ADR-XXXX) / 廃止
- 日付: YYYY-MM-DD
- 関連: <99の項目 / 関連ADR / コード>

## なぜ（背景・課題）
## 結論（決定）
## 検討した代替案と捨てた理由
- 案X … → 捨てた理由
## 影響（結果・トレードオフ）
```

- コミットの「記録:」行に ADR 番号を紐づける（`commit-pr-format`）。

## 学習メモ

- 置き場：`docs/notes/YYYY-MM-DD-topic.md`（短く）
- 目的：理解の蓄積（縛りではなく「学び」＝プロジェクト主目的の半分）。ADR・コードへリンクする。
- テンプレート：

```
# <トピック> (YYYY-MM-DD)
## 学んだこと
## なぜ重要 / どこで効く
## 関連（ADR・コード・docs）
```
