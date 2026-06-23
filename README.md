# MachiLens（仮称）

住み替えを考え始めた人向けのエリア探索ツール。国土交通省「不動産情報ライブラリ」の公的データを地図に重ね、
物件サイトが見せる「個別物件の今（点）」ではなく「街そのものの素性とこれから（面）」を自分で調べ・比べられる。

> プロダクト名は仮称。MVP は首都圏9都県・市区町村粒度。詳細は各ドキュメントを参照。

## ドキュメント
- `CLAUDE.md` — AIエージェント向けの進め方と地図（まずここ）
- `docs/01_project-overview-scope.md` — 概要・スコープ
- `docs/02_architecture.md` — アーキテクチャ・データ仕様
- `DESIGN.md` — UI憲法
- `docs/04_harness.md` — AI駆動の進め方
- `docs/99_decision-register.md` — 決め事の台帳（確定・保留）

## セッション再開（運用ルール）

長い文脈（roadmap 等）はチャットに貼れないので、**ファイルから読み込ませる**。
`prompts/resume.md` は「**固定枠（テンプレ）＋現在地（毎回更新）**」で構成する。

### ファイル構成（テンプレとプロンプト本体を分離）
- `prompts/_resume.template.md` … **固定テンプレ（tracked）**。役割・読むもの・守ること。基本いじらない。
- `prompts/resume.md` … **プロンプト本体（gitignore＝ローカル）**。テンプレ＋現在地・優先順・直近を埋めた実体。
- `prompts/history/` … 過去の `resume.md` スナップショット（`<日付>-resume.md`）。

### 手順（仕組み）
1. **初回 / clone 後（無ければ）**：`prompts/_resume.template.md` を `prompts/resume.md` に複製し、現在地を埋める（`/checkpoint` でも可）。
2. **再開（load）**：新セッションで **`/catchup`** を実行（スキル `catchup`）。`prompts/resume.md` とその参照先（`docs/99`・直近ADR）を読んで現在地を要約し、指示待ちで止まる。※旧名 `/resume` は Claude Code 標準コマンド（過去セッション切替）と衝突するため改名した。
   ```
   /catchup
   ```
   （スキルを使わず1行貼付でも可：`prompts/resume.md を読んで現在地を復元し、続きから進めて。`）
3. **チェックポイント（save）**：区切り/終了時に **`/checkpoint`** を実行 → 旧 `resume.md` を `history/` に控え、`resume.md` の【更新】ゾーン（現在地・優先順・直近）だけを最新化する（固定ゾーンは触らない）。

> 権威ある記録は `docs/99_decision-register.md`（バックログ）と `docs/adr/`。`resume.md` はその要約＋現在地。
> `prompts/` 配下のファイルは gitignore（テンプレ `_resume.template.md` と `.gitkeep` だけ tracked）。

## 秘匿情報（APIキー）— 人間が手動で設定する

APIキーはリポジトリに置かず、**リポジトリ外の `~/.config/config.env` に置いて環境変数で渡す**。
アプリ（ingest / api）は環境変数 `MLIT_API_KEY` 経由でのみ参照する。

### 設定（初回）

```bash
# 1. 秘匿ファイルを作成（リポジトリ外・パーミッション 600）
touch ~/.config/config.env && chmod 600 ~/.config/config.env

# 2. 普通のターミナルでエディタを開き、実キーを記入する（お好みのエディタで）
nano ~/.config/config.env        # 例: vim ~/.config/config.env  /  code ~/.config/config.env
#    記入内容: export MLIT_API_KEY="あなたの実キー"

# 3. シェル起動時に読み込む（~/.bashrc に1行だけ追加。参照点はここに固定）
grep -q 'config.env' ~/.bashrc || echo 'source ~/.config/config.env' >> ~/.bashrc
source ~/.bashrc

# 4. 確認（値は表示せず、セット済みか否かだけ）
[ -n "$MLIT_API_KEY" ] && echo "MLIT_API_KEY: set" || echo "MLIT_API_KEY: NOT set"
```

### 更新（キーの差し替え）

```bash
nano ~/.config/config.env        # 値を書き換えて保存（vim / code でも可）
source ~/.config/config.env      # 再読込（新しいシェルを開いてもよい）
```

> 値の記入・更新は**必ずエディタで**行う（`echo` で書くと `~/.bash_history` に実キーが残るため）。
> **AIエージェントはこのファイル・環境変数・キーに一切触れない**（読取・探索・値の表示・コミットを禁止）。詳細は `CLAUDE.md`。
> 環境構築手順の完全版（melta-ui 取り込み手順を含む）は別途整備予定（`docs/99_decision-register.md` の保留事項）。
