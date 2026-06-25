#!/usr/bin/env bash
# dev-api.sh — ローカル開発用に Go API（:8080）を起動する。
#
# 設計：API はホストで直接走るプロセス（コンテナではない）。DB 接続情報（POSTGRES_*）は
# リポジトリ外の ~/.config/config.env から読み込む（中身は表示しない・ingest-n03.sh と同じ self-source 方式）。
# 対話シェルで既に source 済みでも二重で無害。これでどのシェルから呼んでも接続情報が揃う。
# go が PATH に無ければ ~/.local/go/bin を補う（対話シェルでは ~/.bashrc が通している前提）。
set -euo pipefail

# 秘匿は中身を見ず source するだけ（CLAUDE.md / ADR-0024 と同じ作法）。
# shellcheck disable=SC1090
[ -f ~/.config/config.env ] && source ~/.config/config.env

# 未設定は値を出さず即エラー（compose の ${VAR:?} と同じ思想）。
: "${POSTGRES_USER:?POSTGRES_USER 未設定。~/.config/config.env を設定（README「DB 接続情報」参照）}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD 未設定。~/.config/config.env を設定（README 参照）}"
: "${POSTGRES_DB:?POSTGRES_DB 未設定。~/.config/config.env を設定（README 参照）}"

command -v go >/dev/null 2>&1 || export PATH="${HOME}/.local/go/bin:${PATH}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
echo "dev-api: Go API を起動（http://localhost:8080・DB は :${POSTGRES_PORT:-5432}）"
exec go run ./cmd/api
