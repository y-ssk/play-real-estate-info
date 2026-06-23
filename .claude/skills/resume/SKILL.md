---
name: resume
description: 新セッションの再開（load）。prompts/resume.md とその参照先（docs/99・直近ADR）を読んで現在地を把握し、要約を一度提示してからオーナーの指示を待つ。前のめり禁止。整理（save）側は checkpoint。
---

# 再開（セッションの load）

新セッションで「続きから」始めるためのスキル。`prompts/resume.md` を起点に現在地を復元し、**要約を一度提示してから指示を待つ**。整理して書き戻す（save）のは別スキル `checkpoint`。これは**読んで再開する**側。

## 手順
1. `prompts/resume.md` を読む。**無ければ** `prompts/_resume.template.md` を読み、「resume.md が未生成」とだけ伝える（憶測で現在地を埋めない）。
2. resume.md の【固定】ゾーン「まず読むもの」に従って参照先を読む：
   - `CLAUDE.md`（通常は自動ロード済み。未ロードなら読む）
   - `docs/99_decision-register.md`（確定の索引＋バックログ＝**権威**）
   - `docs/adr/` の最新（直近の決定の経緯。番号が最大のものを確認）
   - resume.md の【更新】ゾーン「現在地・優先順・直近」
3. 現在地を**簡潔に要約**して提示する：(a) どこまで進んだか (b) 優先順（権威は `docs/99`）(c) 次の一手の候補。
4. **そこで止まる。** オーナーの指示を待つ。実装・要件定義へ前のめりに進まない。

## 守ること（CLAUDE.md／resume.md 固定ゾーンより）
- 壁打ちモード（選択肢＋理由＋トレードオフ、決定は PO）。1ブロックずつ。**前のめり禁止**。
- 新しい論点はその場で決めず `docs/99` へ預ける。
- `main`/`dev` は保護（直接 commit/push 禁止）。feature → PR。`dev→main` はオーナー承認。
- 秘匿（APIキー・`~/.config/config.env`・`MLIT_API_KEY`）には一切触れない。

## 禁止
- 要約を飛ばして作業に着手すること。
- resume.md の書き換え（更新は `checkpoint` の役目）。
- 権威の取り違え。roadmap の正は `docs/99`。resume.md はその要約。

> 関連: 整理・書き戻し（save）側は スキル `checkpoint`。運用全体は README「セッション再開」。テンプレ原本は `prompts/_resume.template.md`。
