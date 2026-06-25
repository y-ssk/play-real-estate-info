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

## 開発（ローカル・段0 足場）

前提ツール：**Go 1.22+**（`ADR-0020`）／**Docker（Compose v2）**／**Node 24**（`ADR-0021`・`corepack` で pnpm 固定）。
段0 は足場のみ（データ投入・指標は段1以降）。`MLIT_API_KEY` は段0 では不要。

> **先に DB 接続用の環境変数を設定**しておく（下記「DB 接続情報」）。未設定だと `make db-up`/`make migrate` は
> 手順を案内して止まる（実値をリポジトリに残さないため・`MLIT_API_KEY` と同じ思想）。

```bash
# 0. FE 依存を入れる（corepack が pnpm を版固定で用意）
corepack enable
make fe-install

# 1. DB（PostGIS）を起動 → migrations を流す（PostGIS 拡張＋空の admin_unit）
#    ※ POSTGRES_* を ~/.config/ の env で設定し source 済みであること（下記「DB 接続情報」）
make db-up
make migrate

# 2. API（:8080）と FE 開発サーバ（:3000）を別ターミナルで
make dev-api          # http://localhost:8080/api/health → {"status":"ok"}
make dev-web          # http://localhost:3000 → GSI 淡色下地の空地図

# 検証
make lint             # gofmt+vet（Go）/ Biome（FE）
make test             # go test / Jest
make build            # FE を dist へビルド → API バイナリに embed して go build
```

- 開発時は Rsbuild 開発サーバ（:3000）が `/api` を Go（:8080）へプロキシする。本番のみ `web/dist` を Go が embed 配信する二段構え（`ADR-0013`）。
- `make migrate` は host へ golang-migrate を入れず Docker（`migrate/migrate`）で回す（再現性）。`--network=host` で host の `localhost:$POSTGRES_PORT` に届く。
- DB 接続情報は `docker-compose.yml`・`Makefile` ともに環境変数（`POSTGRES_*`）から読む。**実値はリポジトリに置かない**（下記「DB 接続情報」）。

> 注意（段1の前提・要対応）：境界投入ツール `shp2pgsql` は `postgis/postgis:16-3.4` イメージに**同梱されていない**ことを段0 で確認した（`backend-conventions` §5・`ADR-0022` は同梱前提）。段1 着手時に投入経路を確定する（`docs/99` に論点登録）。

### DB 接続情報（環境変数・人間が手動で設定）

DB のユーザー/パスワード/DB 名/公開ポートは **リポジトリにベタ書きせず**、リポジトリ外の env ファイルに置いて
環境変数で渡す（`MLIT_API_KEY` と同じ思想：実値はリポジトリ外・手動設定・ここに手順）。`docker-compose.yml` と
`Makefile`（`make migrate` の接続文字列）が同じ変数を見るので、値が二重化しない。

| 変数 | 意味 | ローカル例値 | 必須 |
|---|---|---|---|
| `POSTGRES_USER` | PostgreSQL ユーザー名 | `machilens` | ✅（未設定でエラー） |
| `POSTGRES_PASSWORD` | PostgreSQL パスワード | `localdevpass`（任意の文字列） | ✅（未設定でエラー） |
| `POSTGRES_DB` | データベース名 | `machilens` | ✅（未設定でエラー） |
| `POSTGRES_PORT` | host 側の公開ポート | `5432`（既定） | 任意（既定 5432） |

> ローカル用だが、特にパスワードを tracked なファイルに残さない（`.gitignore` の `*.env` 方針と一致）。
> 本番は別の運用（クラウドのシークレット管理等）に差し替える。

#### 設定（初回）

`POSTGRES_*` は **`MLIT_API_KEY` と同じ `~/.config/config.env` に追記**する（このファイルは下記「秘匿情報」で作成済み・`~/.bashrc` から source 済み＝**追加の source 行は不要**。秘匿と env を1ファイルに集約する）。

```bash
# 1. config.env をエディタで開く（無ければ下記「秘匿情報」の手順で先に作成）
nano ~/.config/config.env   # 例: vim / code でも可
#    追記内容（export 付き＝source で環境変数になる）:
#      export POSTGRES_USER="machilens"
#      export POSTGRES_PASSWORD="<任意のローカル用パスワード>"
#      export POSTGRES_DB="machilens"
#      export POSTGRES_PORT="5432"        # 既定でよければ省略可

# 2. 再読込（新しいシェルを開いてもよい）
source ~/.config/config.env

# 3. 確認（値は表示せず、セット済みか否かだけ）
[ -n "$POSTGRES_PASSWORD" ] && echo "DB env: set" || echo "DB env: NOT set"
```

> 値の記入・更新は**エディタで**行う（`echo` で書くとパスワードが `~/.bash_history` に残るため）。
> `config.env` は API キーと同じファイル。`~/.bashrc` から既に source されるので、DB 用に別ファイルや別の source 行は作らない。

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
