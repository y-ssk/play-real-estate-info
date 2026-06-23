# サブエージェントは CLAUDE.md を継承しない (2026-06-23)

## 学んだこと
Claude Code のサブエージェントは独立したコンテキスト窓で動き、プロジェクトの `CLAUDE.md` や
メモリを自動継承しない。役割別の文脈は、各エージェントの system prompt 冒頭で
「最初に読む docs」を明示して与える必要がある。

## なぜ重要 / どこで効く
2役（implementer / reviewer）の設計に直結。FE＝`DESIGN.md`、BE/ETL＝`docs/02` という
「役割別にコンテキストを絞る」（`docs/04` 第3節）を、system prompt での明示読み込みで実装した。
なお秘匿遮断は `.claude/settings.json` の deny がセッション単位で効くため、サブエージェントにも適用される。

## 関連
- `.claude/agents/implementer.md` / `reviewer.md`
- `docs/04_harness.md` 第3節 / `CLAUDE.md` 役割節
- `99_decision-register.md`「2役のClaude Code実装」
