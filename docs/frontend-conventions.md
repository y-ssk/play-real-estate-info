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
- **面塗りの結線（`/values`→`setFeatureState`→fill・段1 ②a 確立）**：値は TanStack Query で取得し（`useChoroplethValues(metric)`）、**形（geometry source）と値が両方そろってから** `setFeatureState({source, id: code}, {value, present:true})` を張る（source 描画前の `setFeatureState` は無視されるため順序が要る）。**指標切替・再取得では `removeFeatureState({source})` で一旦消してから張り直す**（前指標の持ち越し防止）。**fill-color は `["feature-state","value"]` を段階色へ補間**（色式・不透明度式は `styles/mapTokens.ts` の用途トークンに集約＝feature 側で生式を書かない・§4）。**データなしは色抜き**＝present でない（state 未設定）feature は **fill-opacity を 0**（null 比較は MapLibre 式の型に乗らないため真偽フラグ `present` で判定。値0＝該当なしは present=true で塗り「未調査」と区別・`ADR-0011`）。輪郭線レイヤーは塗りの上に残す。**段階色は青（浸水慣例）とコーラル（操作色）を避ける**中立系（`DESIGN`§1）。凡例（色段＋値域＋出典）は地図と同じ stops から作り一致させる。
- **指標の見せ方は registry に集約（②c）**：表示名・単位・**配色方式（sequential/diverging）**・出典・値整形を `features/choropleth/metrics.ts`（`METRICS`）に1か所で持ち、Layer/Legend/Toggle が参照する＝**指標追加は1エントリ追加**で済む（色値・式は持たず `mapTokens` を指す・§4）。`/values` の応答に含まれない「見せ方」をここで束ねる。
- **発散（diverging）配色は0%中央に固定（②c 将来人口増減率）**：符号付き指標は `mapTokens` の `divergingFillColor/divergingFillLegend`（**ColorBrewer PRGn 紫↔緑・青/コーラルを避け色覚配慮**）。**対称ドメイン `[-bound,+bound]`（`bound=max(|min|,|max|)`）で0を必ず中央色に当てる**（データ中点に流されない＝増減の境がずれない）。凡例も中央0%を明示。逐次（量）と発散（符号付き）は `metrics.ts` の `scale` で分岐。**推計指標は凡例/出典に「推計」を明示**（`ADR-0009` 断定しない）。
- **選択中の指標は当面 `useState`（②c）**：app 層が `metric` を持ち Toggle/Layer/Legend へ渡す（三者を1つの真実に揃える）。§3 の「選択中の指標＝Zustand」へは、**パネル/絞り込み等の横断 UI 状態が増える段で昇格**（純ローカルで足りるうちは `useState`・docs/99 トリガー）。
- **選択中の単位＝Zustand（③・段1スライス③で初導入）**：`web/src/lib/selection.ts` の `useSelectionStore`（`selectedUnit: {unitKind, unitId} | null`／`select`／`clear`）。**識別子は `{unitKind, unitId}`**（裸の文字列にしない＝メッシュ移行の継ぎ目・§2/`ADR-0018`）。**共有層 `lib/` に置く**＝map（クリックで選ぶ）と karte（カルテを出す）が共有するため、機能どうしを直接依存させない（§1）。**状態の真実は store**・地図の選択強調（`setFeatureState({selected})`）は描画の鏡（二重管理しない）。購読は selector で必要分だけ（`useSelectionStore((s) => s.selectedUnit)`）。
- **地図クリック→選択の結線**：合成点の `app/App.tsx` が `MapView` に `interactiveLayerIds=[CHOROPLETH_FILL_LAYER_ID]`（面塗り面＝押せる層）と `onMapClick` を渡す。`MapView` は「何を選ぶか」を知らずクリックイベントを素通しし、App が `feature.id`（geometry API が付与した5桁コード・`promoteId` 不使用）を読んで `select({unitKind:'municipality', unitId})` する。面以外（基図）クリックは `features` 空＝無視。
- **カルテパネル＝③開閉式（`DESIGN`§2）**：`features/karte/KartePanel.tsx`。`selectedUnit` が null ならパネルを出さない＝地図全面（閉）／単位選択で右側固定パネルを開く。`useKarte(unit)`（TanStack Query・`enabled: unit!==null`・キーに `unitKind` を含む）で取得。**表示名・単位・値整形は `features/choropleth/metrics.ts` の registry を流用**（二重管理しない・§5）＝カルテと面塗りで指標の見せ方が一致。**データなし3区別を表示し分ける**（none＝「データなし」・suppressed＝「秘匿」・present＝整形値〔0含む〕・`ADR-0011`）。**推計は registry の表示名/出典に「推計」を明示**（`ADR-0009`）。データを詰める場所ゆえ body-sm 相当（`DESIGN`§3）。**モバイルのボトムシートは PC 実装後**（コンポーネント doc に申し送り済）。
- **絞り込み・並べ替え＝Zustand 共有状態＋純関数（④・段1スライス④で初導入）**：条件（指標ごとの min/max）・並べ替え（指標キー＋向き）は **filter store**（`web/src/lib/filterStore.ts` の `useFilterStore`）に持つ＝**状態の真実は store**（パネルの入力・一覧の並べ替えヘッダ・地図ハイライトの三者が唯一の真実として参照・二重管理しない・`ADR-0018`）。共有層 `lib/` に置く（filters/list/map が共有＝機能どうしを直接依存させない・§1／選択 store と同方針）。**重みづけ（スコアリング）はしない＝条件は AND**（`ADR-0012`）。
- **絞り込み/並べ替え/突き合わせのロジックは純関数に切り出す（`web/src/lib/filtering.ts`）**：(a) 単位行の組み立て（geometry の code/name × 各指標 `/values` を **code で突き合わせ**・geometry が母体＝描ける区だけ）／(b) 絞り込み（AND・**データなし `status≠present` は当該条件を満たさず除外**＝数値比較不能・「未調査」を条件内に紛れ込ませない・`ADR-0011`）／(c) 並べ替え（**安定**・**データなしは向きに依らず末尾**・同値はコード昇順でちらつかせない）。React/取得層に依存させず**単体テストで手厚く**（本丸＝状態ロジック・§8）。
- **全指標値の取得は `useQueries`（`features/filters/useAllMetricValues.ts`）**：絞り込みは「市区町村ごとの全数値」に効く（`ADR-0012`）ため `METRIC_ORDER`（registry）を横断して取得＝**指標追加は registry 1エントリで自動的に対象**。`useChoroplethValues` と**同一 queryKey/queryFn** ゆえ面塗りで取得済みの指標はキャッシュ共有（二重取得しない）。
- **絞り込みは MVP＝クライアント側**（69 市区町村ゆえ素直に・`ADR-0015`/`0017`）。**サーバ側の動的 WHERE（生 SQL）は作らない**＝v1/規模が増えた時の選択肢として申し送る（生 SQL は名前のつく例外・`backend-conventions`§1）。
- **地図の絞り込みハイライト＝`setFeatureState({matched})`＋不透明度の別チャネル**：該当を通常塗り・非該当を淡く沈める（`CHOROPLETH_MATCHED_FILL_OPACITY_EXPR`・`mapTokens`）。**色（値の大小・`ADR-0005`）は変えず、強調は不透明度で行う**（色の意味を壊さない・DESIGN §1）。matched は描画の鏡（真実は filter store・該当は App が純関数で導出）。**値 effect が `removeFeatureState` で全 state を消すため、matched/selected effect は `values` を依存に持ち消去後に張り直す**（ChoroplethLayer のコメント参照）。
- **絞り込みパネル＝③開閉式・左側（`DESIGN`§2）**：`features/filters/FilterPanel.tsx`。**カルテパネル（右側・KartePanel）と左右で住み分け**、同時に開いても重ならない（過剰 UI にしない）。0件時は分かるメッセージを出す（黙って空表にしない）。値整形・表示名・単位は registry を流用（カルテ/凡例と一致・§5）。並べ替え向きの矢印は**絵文字を使わず**示す（`DESIGN`§6・no-emoji）。
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
