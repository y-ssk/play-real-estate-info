# ADR-0021: FEパッケージ管理＝pnpm（corepackで版固定）。Node版は .nvmrc＋engines
- ステータス: 承認
- 日付: 2026-06-25
- 関連: `docs/99_decision-register.md`（保留→確定「パッケージ管理・Node版」・足場づくり）／**お作法の最新は `docs/frontend-conventions.md` §11**（本ADRは凍結記録）／`ADR-0013`（FE器＝React＋Rsbuild＋Jest・攻撃面最小の軸）／学習メモ `docs/notes/2026-06-25-package-managers.md`

## なぜ（背景・課題）
FE（`web/`）の依存パッケージを管理する道具と、Node の版をどう固定するかが未決（`docs/99` 保留）。足場づくりで確定が要る。判断軸＝攻撃面最小・単一ツール志向（`ADR-0013`）＋「軽量だから」で即決せず堅牢性の根拠で選ぶ。

## 結論（決定）
- **パッケージ管理＝pnpm。** Node 同梱の `corepack` で版を固定（`package.json` の `packageManager` 欄）＝手動の全体導入なしに版ごと再現できる。
- **Node 版＝`.nvmrc`＋`package.json` の `engines`。** 現行 LTS 系（**実装着手時に最新 LTS を公式で確認して固定**・憶測で数字を打たない）。
- 採用根拠は「速いから」ではなく**依存解決の厳格さ**＝幽霊依存（宣言していない間接依存を `import` できてしまう罠）を構造的に弾く堅牢性。AI 実装役が誤って間接依存に頼るのを開発時に防げる。`corepack` が npm の唯一の優位（ゼロ追加）を打ち消す。

## 検討した代替案と捨てた理由
- **npm** … 追加ゼロだが平坦 `node_modules` で幽霊依存を許す。`corepack` で pnpm も実質ゼロ追加になり、その優位が薄れる。
- **yarn** … berry(v2+) は PnP 等で癖、classic(v1) はメンテ縮小。今あえて選ぶ動機が薄い。捨てる。

## 影響（結果・トレードオフ）
- 取り決め（お作法）＝`frontend-conventions` §11。lockfile＝`pnpm-lock.yaml`。CI/pre-commit の再現インストールは `pnpm install --frozen-lockfile`。
- `corepack enable` が前提（Node 同梱）。稀に平坦 `node_modules` を前提にする古いパッケージで詰まる（近年ほぼ解消）。
