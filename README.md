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
