# ADR-0001: APIキーをリポジトリ外に隔離し、AIから遮断する

- ステータス: 承認
- 日付: 2026-06-22
- 関連: `99_decision-register.md`「APIキー秘匿・配置方式」 / `CLAUDE.md` / `.claude/settings.json` / `README.md`

## なぜ（背景・課題）
MLIT APIキー等の秘匿情報について、(1) リポジトリにコミットしない、(2) AIエージェントが
読取・探索・表示しない、の2点を確実にしたい。「gitignore を信じる」という規律ではなく、
構造（そもそも触れない・置かない）で担保したい。

## 結論（決定）
実キーは **リポジトリ外** `~/.config/config.env`（`chmod 600`）に `export MLIT_API_KEY="..."` で置き、
`~/.bashrc` から `source` する。**BE（Goアプリ）は環境変数 `MLIT_API_KEY` 経由でのみ参照**する。
AIからの参照は `CLAUDE.md`（指示）＋ `.claude/settings.json` の deny（Read/Edit 遮断）で多層遮断。
設定・更新は人間がエディタで手動で行う（手順は `README.md`）。

## 検討した代替案と捨てた理由
- **リポ内 `.env` / `secret.yaml` ＋ gitignore**：コミット耐性が「規律頼み」で構造的でない → 却下。
- **`~/.bashrc` に `export` を直接散在**：参照点が分散し管理しづらい → 1ファイルに集約。
- **yaml ＋ shell（grep/sed）で env へ橋渡し**：可動部が増え脆い → 廃止。
- **sops + age（暗号化してコミット）**：最も堅牢だがソロMVPには過剰 → 将来枠（CI・チーム・本番の発生時に昇格）。

## 影響（結果・トレードオフ）
- キーはリポジトリに存在しないため、設定は各環境で人間が手動。AIはキーに一切触れない前提で運用する。
- 仮称 `machilens` を避け、`.config` 直下の `config.env` を採用（正式名が確定しても改名不要）。
