# パッケージマネージャ（npm/pnpm/yarn）と「何がどう堅牢か」 (2026-06-25)

> pnpm 採用（`ADR-0021`・お作法 `frontend-conventions` §11）にあたり、各道具の違い・堅牢性の中身・npm との操作対応を噛み砕いた保存。

## 0. そもそもパッケージマネージャとは
FE は大量の外部ライブラリ（React、MapLibre…）に依存する。各ライブラリは**さらに別のライブラリに依存**する（依存の依存＝間接依存）。これを `package.json`（何が欲しいか）と lockfile（実際に入れた版を釘付け）に基づき、`node_modules/` へ取り寄せ・再現する道具がパッケージマネージャ。

## 1. 各道具の素性
- **npm**：Node に**同梱**＝追加導入ゼロ。`node_modules` は**平坦（hoist）**で、間接依存も最上位に並べる。lockfile＝`package-lock.json`。最も普遍的だが、後述の幽霊依存を許す。
- **pnpm**：別物だが Node 同梱の `corepack` で導入・版固定できる。`node_modules` を**symlink で厳格に組む**＋**実体はマシン共通の格納庫（content-addressable store）にハードリンク**。lockfile＝`pnpm-lock.yaml`。厳格・速い・ディスク効率が高い。
- **yarn**：classic(v1) は npm 類似の平坦型で**メンテ縮小**。berry(v2+) は PnP（`node_modules` を作らない独自方式）で強力だが癖が強い。lockfile＝`yarn.lock`。今あえて選ぶ動機が薄い。

## 2. 何がどう堅牢か＝「幽霊依存（phantom/ghost dependency）」を弾く
**具体例で：** あなたが `express` だけを入れたとする。express は内部で `debug` というライブラリに依存している。
- **npm（平坦）**：`debug` も `node_modules/` の最上位に置かれる。だから**あなたが `package.json` に `debug` を書いていなくても `import debug from 'debug'` が通ってしまう**。
  - これが**手元では動く**。だが：(a) express が更新で `debug` を落とすと、あなたのコードが突然壊れる。(b) CI や同僚の環境で依存の並びが少し違うと `debug` が最上位に来ず、やはり壊れる。＝「**自分の環境でだけ動く**」の温床。これが幽霊依存。
- **pnpm（symlink で厳格）**：`debug` は express の内側にだけ繋がれ、**あなたの最上位からは見えない**。宣言していない `import debug` は**開発中にその場で失敗**する。→ 強制的に「使うなら自分の `package.json` に宣言せよ」となり、**宣言＝実際に import 可能なものが一致**。どの環境でも同じに動く。

つまり pnpm の堅牢性とは「**宣言した依存しか使えない**ので、宣言と実体がずれず、再現性が壊れない」こと。速さ/ディスク（共通格納庫＋ハードリンク＝各版をマシンに1つだけ持ち各プロジェクトへリンク）は副次の利点で、主眼はこの厳格さ。

## 3. コマンド対応表（pnpm ⇔ npm）
> 慣れた npm の手が pnpm で何になるか。

| やること | pnpm | npm |
|---|---|---|
| 依存を一括取得（初期化・clone後） | `pnpm install`（略 `pnpm i`） | `npm install` |
| 依存を追加 | `pnpm add <pkg>` | `npm install <pkg>` |
| 開発用に追加（型・lint 等） | `pnpm add -D <pkg>` | `npm install -D <pkg>` |
| 削除 | `pnpm remove <pkg>` | `npm uninstall <pkg>` |
| スクリプト実行（`package.json` の scripts） | `pnpm <script>`（例 `pnpm dev`）/ `pnpm run <script>` | `npm run <script>` |
| 一時実行（入れずに使う） | `pnpm dlx <pkg>` | `npx <pkg>` |
| 更新 | `pnpm update`（略 `pnpm up`） | `npm update` |
| lockfile 厳守の再現インストール（CI） | `pnpm install --frozen-lockfile` | `npm ci` |
| 版固定（道具自体の版） | `corepack enable` ＋ `package.json` の `packageManager: "pnpm@x.y.z"` | （npm は Node 同梱） |

落とし穴：`pnpm <script>` は `run` を省ける（`pnpm dev`）が、`install`/`add` 等の予約語と被る名前の script は `pnpm run <名>` と明示する。

## 4. Node の版固定
- `.nvmrc`（`nvm`/`fnm` 等が読む版番号）＋ `package.json` の `engines`（不一致を警告/弾く）。
- 版は**現行 LTS 系。最新 LTS は実装着手時に公式で確認して固定**（憶測で数字を打たない）。

## 関連（ADR・docs）
- `ADR-0021`（採用判断）／`frontend-conventions` §11（お作法）／`ADR-0013`（FE器・攻撃面最小の軸）
