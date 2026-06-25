# MachiLens 開発タスクの束ね（段0 足場）。
# 本丸（ETL・データ・地図表現）に集中できるよう、起動・マイグレ・lint・test を1入口に集約する。
#
# 前提ツール：Go 1.22+ / Docker（Compose v2）/ Node 24（corepack で pnpm）。
# DB 接続情報はシェル環境変数で渡す（~/.config/ の env を ~/.bashrc から source・README 参照）。
# compose と migrate が同じ env を見るので値が二重化しない。MLIT_API_KEY は段0 では不要。

# golang-migrate を host へ入れず Docker で回す（再現性・ホスト無依存）。
MIGRATE_IMAGE ?= migrate/migrate:v4.18.1
PNPM ?= pnpm --dir web

# DB 接続文字列を環境変数から組み立てる（compose と同じ POSTGRES_* を参照）。
# 未設定はここでエラーにし、握りつぶさず気づけるようにする（compose の ${VAR:?...} と同じ思想）。
POSTGRES_USER ?= $(error POSTGRES_USER 未設定。~/.config/ の env を設定し source（README 参照）)
POSTGRES_PASSWORD ?= $(error POSTGRES_PASSWORD 未設定。~/.config/ の env を設定し source（README 参照）)
POSTGRES_DB ?= $(error POSTGRES_DB 未設定。~/.config/ の env を設定し source（README 参照）)
POSTGRES_PORT ?= 5432
# migrate コンテナは --network=host で host の localhost:PORT に届く（compose が publish）。
DATABASE_URL ?= postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:$(POSTGRES_PORT)/$(POSTGRES_DB)?sslmode=disable

# N03 投入の対象（年度・都県）。既定は段1の対象＝令和5年版・東京都（ADR-0024）。
# 別の版/県を流すときは make fetch-n03 YEAR=... PREF=... のように上書きする。
N03_YEAR ?= 2023
N03_PREF ?= 13

.PHONY: help dev dev-api dev-web db-up db-down migrate migrate-down fetch-n03 ingest-n03 lint lint-go lint-web test test-go test-web build build-web fe-install

help: ## このヘルプを表示
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

## --- 起動 ---
dev: db-up ## DB を起動し、API（:8080）と FE 開発サーバ（:3000）の起動方法を案内
	@echo "DB 起動済み。別ターミナルで以下を実行："
	@echo "  make dev-api   # Go API（:8080）"
	@echo "  make dev-web   # Rsbuild 開発サーバ（:3000・/api を :8080 へプロキシ）"

dev-api: ## Go API を起動（:8080）
	go run ./cmd/api

dev-web: fe-install ## FE 開発サーバを起動（Rsbuild・:3000）
	$(PNPM) dev

## --- DB / マイグレーション ---
db-up: ## PostGIS コンテナを起動（healthy まで待つ）
	docker compose up -d --wait db

db-down: ## PostGIS コンテナを停止（データは保持）
	docker compose stop db

# migrate/migrate-down の実行行は @ で echo 抑制＝接続文字列（パスワード込み）を端末・履歴に出さない。
migrate: ## migrations を適用（PostGIS 拡張＋空の admin_unit）
	@docker run --rm --network=host \
		-v $(CURDIR)/migrations:/migrations $(MIGRATE_IMAGE) \
		-path=/migrations -database "$(DATABASE_URL)" up

migrate-down: ## 直近の1マイグレーションを戻す
	@docker run --rm --network=host \
		-v $(CURDIR)/migrations:/migrations $(MIGRATE_IMAGE) \
		-path=/migrations -database "$(DATABASE_URL)" down 1

## --- N03 境界の取得・投入（ADR-0024・backend-conventions §5.1・手順は docs/runbooks/n03-ingest.md）---
# 取得＝直リンクで落として data/n03/{YEAR}/{PREF}/ へ展開（年度・都県は N03_YEAR/N03_PREF で上書き可）。
# 実行行は @ で echo 抑制＝migrate と同じ流儀（コマンド行に接続情報を将来足しても端末・履歴に出さない方針を揃える）。
# 進捗は script/go 側の echo・log が出すので、Make のコマンド行を消しても手順は追える。
fetch-n03: ## N03 を取得して配置（既定: 令和5年版・東京都。例 make fetch-n03 N03_YEAR=2023 N03_PREF=13）
	@scripts/fetch-n03.sh $(N03_YEAR) $(N03_PREF)

# 投入＋正規化＝①ogr2ogr で n03_raw（生）→ ②go で admin_unit（5桁集約・値域・冪等）。
# パスワードは script 内で PGPASSWORD 経由・go は POSTGRES_* を環境から読む（接続文字列を端末に出さない）。
ingest-n03: ## N03 を投入し正規化（要 DB 起動・source config.env。例 make ingest-n03 N03_YEAR=2023 N03_PREF=13）
	@scripts/ingest-n03.sh $(N03_YEAR) $(N03_PREF)
	@go run ./cmd/ingest -year=$(N03_YEAR) -pref=$(N03_PREF)

## --- 検証 ---
lint: lint-go lint-web ## Go と FE の lint

lint-go: ## Go の整形チェック＋vet（未整形があれば fail）
	@out=$$(gofmt -l .); if [ -n "$$out" ]; then echo "gofmt 未整形:"; echo "$$out"; exit 1; fi
	go vet ./...

lint-web: fe-install ## FE の lint（Biome）
	$(PNPM) lint

test: test-go test-web ## Go と FE のテスト

test-go: ## Go テスト
	go test ./...

test-web: fe-install ## FE テスト（Jest）
	$(PNPM) test

## --- ビルド ---
build: build-web ## FE をビルドして dist を作り、API バイナリを embed 込みでビルド
	go build -o bin/api ./cmd/api
	go build -o bin/ingest ./cmd/ingest

build-web: fe-install ## FE 本番ビルド（dist 生成＝embed の元）
	$(PNPM) build

fe-install: ## FE 依存を再現インストール（lockfile 固定）
	$(PNPM) install --frozen-lockfile
