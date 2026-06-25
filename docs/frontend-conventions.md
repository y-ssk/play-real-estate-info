# フロントエンド実装・レビューのお作法（生きた文書）

> **これは「最新の取り決め」を引く先。** FE の実装時・レビュー時に毎回参照する。決定の経緯（なぜ）は ADR（`docs/adr/`）に凍結し、本書には書かない（**ADR は判断の根拠であって、最新の取り決めを引く先ではない**）。育つ前提（ルールは増減する）。
> **各ルールには根拠（ADR/DESIGN/学習メモ）を併記**する。
> **DESIGN.md との線引き**：**見た目・UX・melta-ui の定義・トークン・色・レイアウトは `DESIGN.md`（視覚の憲法）**。本書は**「どう実装するか（構造・状態・テスト・doc）」**。melta-ui の視覚定義は重複させず、本書は `DESIGN.md`／melta-ui を指してコード側の遵守に落とす。
> 導線：`CLAUDE.md` ドキュメント地図／`.claude/agents/implementer.md`・`reviewer.md` の「最初に読む」。器・対：BE は `docs/backend-conventions.md`。

---

## §1 ディレクトリ／依存（根拠：`docs/notes/2026-06-24-fe-architecture-feature-based`・`ADR-0013`）
- **機能単位（feature-based）**：`web/src/` = `app/`／`features/`（map・filters・karte・comparison・pins）／`components/`（melta-ui 取り込み層）／`lib/`（APIクライアント・地図初期化・共通型・出典/欠損）／`styles/`（tokens）／`test/`。
- **依存は一方通行**：`features/*` → 共有層（`lib/`・`components/`）は可。**機能どうしの直接依存は禁止**（必要なら `app/` か共有層を介す）。
- ハンドラ的な「画面横断の組み立て」は `app/`。SQL ならぬ「取得・状態の組み立て」は `lib/`・各 feature 内に閉じる。

## §2 型安全（根拠：`docs/02`§7＝TypeScript strict・`ADR-0016`/`0017`API形・`ADR-0018`識別子）
- **TypeScript strict**。既定で `any` を使わない（やむを得ない箇所は理由を WHY コメントで残す）。
- **API レスポンス型を `lib/`（取得層）に明示定義**し、サーバの形（`/values`・`/karte`・`/geometry`・絞り込み）と一致させる。
- **選択中の単位は共有型 `{ unitKind, unitId }`**（裸の文字列にしない）＝メッシュ移行の継ぎ目（`ADR-0018`/`ADR-0015`）。Query のキャッシュキーにも `unitKind` を含める。

## §3 状態（根拠：`ADR-0018`）
- **サーバ状態＝TanStack Query**（`/values`・`/karte`・絞り込み等の取得・キャッシュ・再取得・失敗）。geometry/タイルは行き先Aで MapLibre が自前取得＝Query の範囲外。
- **クライアントUI状態＝Zustand**（選択中の指標/分野/単位・絞り込み・パネル開閉）。selector で必要分だけ購読。純ローカルは `useState`。
- **混ぜない**（サーバ状態を Zustand に溜めない／UI状態を Query に乗せない）。
- **状態の真実は Zustand、MapLibre の `setFeatureState` は描画の鏡**（二重管理しない）。地図カメラは `react-map-gl` が保持。
- **ピン留め＝Zustand `persist` → localStorage**（`ADR-0012`/`0013`）。

## §4 melta-ui／スタイル（根拠：`DESIGN.md`・melta-ui `prohibited.md`・`ADR-0013`）
- 汎用UIは **`components/`（melta-ui 取り込み層）から参照**。機能側で生の見た目を作り込まない。
- **生値を使わない＝意味/用途トークン経由**（色・余白・タイポ）。**トークンと色の定義そのものは `DESIGN.md`**（本書では定義しない・指すだけ）。
- melta-ui の **`prohibited.md`（禁止事項）を遵守**し、取り込み部分の **MIT 表示を保持**。
- **絵文字（機種依存文字）を UI に使わない**（環境差で崩れる・DSの外＝`DESIGN.md` §6）。アイコンは `components/`（melta-ui 取り込み層＝Charcoal/Lucide・SVG）から、**必要なときだけ**使う。不足分は DS調整の締め（`docs/99`「アイコン体系」）。

## §5 出典／欠損（根拠：`ADR-0011`）
- **出典は全データに保持し、必ず画面に表示**（地図の attribution と各項目）。
- **データなしは3区別**＝「データなし（対象外/未整備）／該当なし＝0／秘匿」。黙って空欄にしない。型・表示で区別する。

## §6 ドキュメンテーション／コメント（根拠：本節の決定・`docs/notes/2026-06-25-doc-comment-style`）
- **WHAT（コードを読めば分かること）は書かない。WHY（意図・非自明な理由・落とし穴）を書く。**
- **公開（エクスポート）したものには日本語の doc 注釈（JSDoc/TSDoc 流）を必須**＝外から使われる窓口だから。対象＝公開関数・コンポーネント・カスタムフック・`lib/` の API クライアント型・Zustand の action。**内部関数は doc 必須にしない（必要時に WHY のみ）**。
- **JSDoc に型を重複させない**（型はシグネチャにある＝TS の強み）。doc は説明・`@example`・`@see`・`@deprecated` を担う。
- 複雑なドメイン処理（指標の算出・座標/コードの正規化）は **WHY ＋ ADR/学習メモへのリンク**。

## §7 lint／整形（根拠：`docs/notes/2026-06-25-lint-formatter-tooling`）
- **Biome**（lint＋整形＋import 整理を単一）。`biome check --write` を基本。設定は1つ。
- 型情報を使うルール（await し忘れ・any 漏れ）は Biome では弱い＝実際に刺さったら ESLint＋typescript-eslint を薄く併用（`docs/99` トリガー）。

## §8 テスト／カバレッジ（根拠：`docs/notes/2026-06-25-test-coverage`・`docs/04`・`ADR-0011`）
- **Jest＋React Testing Library**。E2E（Playwright）は MVP 後。
- 本丸＝状態ロジック・出典/欠損表示・識別子の扱いを手厚く。
- **カバレッジは計測・可視化のみ（当面ゲートにしない）／本丸の分岐カバレッジを重視・周辺の%は追わない／差分カバレッジ（変更行が新たにテストされたか）を主signal**。

## §9 命名
- feature・ファイルは機能/用途名。フック `useXxx`。Zustand store のセレクタ/アクションは用途名。
- API クライアント関数は取得対象名（`fetchMetricValues` 等）。

## §10 レビュー観点（FE版・yes/no で通す）
1. 状態の置き場は正しいか（サーバ→Query／UI→Zustand、混ぜていないか）。
2. 選択単位は `{ unitKind, unitId }` か（裸の文字列でないか）。
3. `any` を避けているか・API レスポンス型は明示か。
4. 機能どうしの直接依存をしていないか。
5. 生値でなくトークン経由か・`prohibited.md` に触れていないか・MIT 表示は保持か（`DESIGN.md` 参照）。
6. 出典表示・データなし3区別はあるか。
7. 公開シンボルに doc があるか・WHAT でなく WHY を書いているか。
8. Biome は通るか。本丸の変更に分岐テストがあるか。

## §11 パッケージ管理・Node 版（根拠：`ADR-0021`）
- **パッケージ管理＝pnpm**。`corepack` で版固定＝`package.json` の `packageManager: "pnpm@x.y.z"`（手動の全体導入をしない）。lockfile＝`pnpm-lock.yaml` はコミット。
- **CI/pre-commit の再現インストールは `pnpm install --frozen-lockfile`**（lockfile を書き換えさせない）。
- **Node 版は `.nvmrc`＋`engines` で固定**。現行 LTS 系（**最新 LTS は実装着手時に公式で確認**・憶測で数字を打たない）。
- **npm の癖を持ち込まない**：`npm install <pkg>`→`pnpm add`、`npx`→`pnpm dlx`、`npm run`→`pnpm <script>`。対応表と「なぜ pnpm か（幽霊依存を弾く）」は `docs/notes/2026-06-25-package-managers.md`。

## §12 以降（今後追記）
> pre-commit 自動化、アクセシビリティの実装作法などが決まったら章を足す（`docs/99` に保留登録済み・同じ器に集約し文書の乱立を防ぐ）。
