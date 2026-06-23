---
name: checkpoint
description: セッションの区切り/終了時に prompts/resume.md の「現在地・優先順・直近」を最新化し、旧版を prompts/history/ に控える。固定テンプレ部は触らない。次回 /resume(1行貼付) で復元できる状態にする。
---

# チェックポイント（再開プロンプトの更新）

区切り・セッション終了時に、次回そのまま再開できるよう `prompts/resume.md` を最新化する。

## 手順
1. `prompts/resume.md` が無ければ `prompts/_resume.template.md` から複製して作る。
2. 現在の `prompts/resume.md` を `prompts/history/<YYYY-MM-DD>-resume.md` に控える（スナップショット）。
   - 同日に既存があれば `-2`, `-3` 等のサフィックスで区別する。
   - 日付は**確認した実日付**を使う（憶測で日付を作らない）。
3. `resume.md` の **【更新】ゾーン（現在地・優先順・直近）だけ**を、会話と `docs/99_decision-register.md` の最新に合わせて書き換える。
   - **【固定】ゾーン（役割・読むもの・守ること）は編集しない。**
   - roadmap の権威は `docs/99`。resume.md はその要約＋現在地。
4. 何を更新したかを 1〜2 行で報告する。

## 禁止
- 【固定】ゾーンの改変。
- 秘匿情報（APIキー等）の記入。

> 関連: 再開（読み込み・load）側はスキル `resume`（`/resume`）。運用全体は README「セッション再開」。テンプレ原本は `prompts/_resume.template.md`。
