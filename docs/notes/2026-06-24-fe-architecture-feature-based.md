# フロントのディレクトリ構成思想：機能単位（feature-based）と Screaming Architecture (2026-06-24)

> MVP の FE ディレクトリ構成を「機能単位」にした背景の学習メモ。知見の蓄積が目的（縛りでなく学び）。

## 学んだこと

### 1. 2つの分け方：型別 vs 機能別
フォルダの切り方には大きく2系統ある。

- **型別（technical / type-based）**：`components/` `hooks/` `utils/` `services/` のように「**それが技術的に何か**」でまとめる。チュートリアルの定番。
- **機能別（feature-based / colocation）**：`map/` `filters/` `karte/` のように「**製品の機能（ドメイン）**」でまとめ、その機能に必要な UI・フック・ロジックを同じフォルダに同居（colocation）させる。

### 2. Screaming Architecture（構造はドメインを叫べ）
Robert C. Martin（Uncle Bob）の言い回し。**プロジェクトの最上位フォルダを開いた時、最初に目に入るべきは「使っているフレームワーク／技術の種類」ではなく「このアプリが何をするか（ドメイン）」だ**、という主張。
- 悪い例：開くと `components/ hooks/ store/` … → 「React アプリだな」しか分からない。
- 良い例：開くと `map/ filters/ karte/ comparison/ pins/` → 「街を地図で見て・絞り込み・カルテで読み・比較し・ピン留めする道具だ」と**機能が叫んでいる**。

### 3. 凝集（cohesion）と変更局所性
1機能に要る物を1か所に集める＝凝集が高い。「カルテを直す」時に触る物が `features/karte/` に固まり、`components/` `hooks/` `lib/` を横断しない。**変更の影響範囲（blast radius）が小さい**＝後からの改良に強い。

### 4. 依存方向の一方通行（decoupling）
- `features/*` → 共有層（`lib/` `components/`）への依存は OK。
- **機能どうしの直接依存は禁止**（必要なら `app/` か共有層を介す）。
- これで機能を足し引きしても他が壊れない。

### 5. Feature-Sliced Design (FSD) との距離
FSD は機能別をさらに形式化した方法論（`app / pages / widgets / features / entities / shared` の層＋層をまたぐ import の厳格な規則）。思想は同じ方向だが、**MVP には層と規約が過剰**。本プロジェクトは FSD の核（機能隔離＋共有層＋一方通行の依存）だけを軽く採り、7層フルは採らない（オーバーエンジニアリング回避）。

## なぜ重要 / どこで効く
- 本品は画面の関心（地図・絞り込み・カルテ・比較・ピン留め）が `ADR-0005`/`ADR-0012` で**既に機能で割れている**。構造をそれに一致させると、ドキュメント上の体験とコードが1対1で対応し、迷いが減る。
- 「型別」は小さいうちは楽だが、機能が増えると1機能の部品が複数フォルダに散り、変更が横断的になって摩擦が増える＝**育つと破綻**。だから最初から機能別にする。
- MVP→スクラム的改良（`docs/99`方針）で機能を足し引きする前提なので、隔離と一方通行の依存が効いてくる。

## 採った構成（MVP）
```
web/src/
  app/         … 起動・プロバイダ・全体レイアウト（機能を束ねる）
  features/    … map/ filters/ karte/ comparison/ pins/（UI＋専用hooks＋専用ロジック同居）
  components/  … 汎用UI＝melta-ui 取り込み層（機能をまたいで再利用）
  lib/         … APIクライアント・地図初期化・共通型・出典/欠損表示
  styles/      … tokens（melta-ui 由来）
  test/        … setup・テスト補助
```

## 関連（ADR・コード・docs）
- 体験・機能の割れ方：`ADR-0005`（指標化の芯）・`ADR-0012`（面で比べる体験）
- このバッチの決定本体：`ADR-0013`（軽い確認バッチ＝認証/地図エンジン/FE器/一体型・構成/ローカル環境）
- 全体構成（一体型・ハイブリッド）：`docs/02_architecture.md`
- UI 部品の土台：`DESIGN.md`（melta-ui 取り込み層＝`components/`）
