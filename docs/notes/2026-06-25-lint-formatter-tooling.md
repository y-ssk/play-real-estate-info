# リンタ/整形ツール：ESLint+Prettier と Biome・type-aware の穴 (2026-06-25)

> 採用は本メモ末尾＝`docs/99` で確定。conventions の lint 章へ反映予定。発端＝監査で「層2のlintの実体が未決定」だった穴（`notes` 監査・不文律化の防止）。

## 学んだこと

### lint と 整形 は別機能
- **lint（ルール）**＝怪しい書き方・バグの芽を検出（ESLint）。
- **整形（format）**＝見た目を機械的に統一（Prettier）。
- ＝ESLint＋Prettier は「ルール＋整形」を2ツールで覆う。

### Biome は両方を単一ツールで
- **lint＋整形＋import整理を1ツール**で（ESLint＋Prettier を置換するのが売り）。Rust製・高速・**依存極小**。`biome check --write` で一括。
- 整形は Prettier と高互換（概ね9割超の同一出力）。lint は200+ルール（typescript-eslint／react-hooks／jsx-a11y からの移植を含む）。

### Biome の正直な穴＝type-aware（型情報を使う）ルールが限定的
- Biome はローカル解析で**TSの型チェッカを使わない**設計のため、`no-floating-promises`（await し忘れ）・`no-unsafe-*`（any 漏れ）等の**型依存ルールは弱い／無い**。ここは ESLint＋**typescript-eslint** が上。
- 一方 **type-aware lint は型チェッカを回すので遅く、pre-commit と相性が悪い**。Biome は単一バイナリで速く pre-commit が快適。

## なぜ重要 / どこで効く（本プロジェクトの決定）
- **BE＝golangci-lint（多数linterを束ねるmeta-linter）＋gofmt/goimports**。doc コメントの強制（revive の exported ルール）もここで効く。
- **FE＝Biome**（lint＋整形＋import整理を単一）。理由：
  1. **type-aware の穴の露出が小さい**＝FEの非同期は TanStack Query が持つ（floating promise の面が小）／TS strict＋`any`既定禁止＋API型を `lib/` に明示（any 漏れの入口を自前で塞ぐ・`ADR-0018`）。
  2. **攻撃面が小さい**＝`ADR-0013` が Vitest を「攻撃面回避」で外したのと同じ判断軸（ESLint＋Prettier＋プラグイン群は依存ツリー大）。
  3. 単一設定・pre-commit が速い。
- **安全弁（可逆）**：await し忘れ・any 漏れが**実際に刺さったら**、型依存ルールだけの ESLint＋typescript-eslint を **Biome と併用**で薄く足す（最初から全部 ESLint に倒すより安い）。

## 関連（ADR・コード・docs）
- 確定：`docs/99_decision-register.md` 保留事項「リンタ/整形ツール」
- `ADR-0013`（攻撃面回避でVitest不採用・トークン不要）／`ADR-0018`（TanStack Query・strict TS・API型明示）
- 反映先（予定）：`docs/backend-conventions.md`／`frontend-conventions.md`（新設時）の lint 章
