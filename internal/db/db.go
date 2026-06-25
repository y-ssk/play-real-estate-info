// Package db は DB 接続の共有土台（DSN 組み立て・接続プール生成）を持つ。
//
// なぜ独立パッケージか：接続情報の組み立て（POSTGRES_* → DSN）は手動側（cmd/ingest）と
// 随時側（cmd/api）の双方が要る。ingest に閉じると api → ingest という不自然な依存になるため、
// 双方が見下ろせる共有層へ切り出す（重複を避ける・backend-conventions §1）。
// 接続の土台は pgx（ADR-0017）。実値（特にパスワード）はリポジトリ外＝環境変数経由で渡す。
package db

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DSNFromEnv は POSTGRES_* から接続文字列を組み立てる（compose/Makefile と同一変数）。
//
// なぜ環境変数からか：実値（特にパスワード）をリポジトリに置かない（config.env→環境変数の一本道）。
// 未設定は即エラーにし握りつぶさない（compose の ${VAR:?} と同じ思想）。返す DSN にパスワードが入るため、
// 呼び出し側は DSN をログ・エラーに載せないこと。
func DSNFromEnv() (string, error) {
	user := os.Getenv("POSTGRES_USER")
	pass := os.Getenv("POSTGRES_PASSWORD")
	name := os.Getenv("POSTGRES_DB")
	if user == "" || pass == "" || name == "" {
		return "", errors.New("POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB が未設定（~/.config/config.env を source する・README 参照）")
	}
	port := os.Getenv("POSTGRES_PORT")
	if port == "" {
		port = "5432"
	}
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		// migrate と同じく host の localhost:PORT（compose が publish）。オーナーの対話シェルから実行する前提。
		host = "localhost"
	}
	// pgx は key=value DSN を解釈する。パスワードに記号が入っても URL エンコード不要なこの形を使う。
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, pass, name), nil
}

// NewPool は POSTGRES_* から pgxpool を作り、起動時に到達性を確かめて返す。
//
// なぜ起動時に Ping するか：env 未設定・DB 未起動を「起動の瞬間」に分かりやすく落とすため
// （随時側 cmd/api の readiness を初手で確定し、後続リクエストで初めて気づく事態を避ける）。
// エラーには DSN（パスワード込み）を載せない＝ingest と同じ作法。呼び出し側は Close 責務を持つ。
func NewPool(ctx context.Context) (*pgxpool.Pool, error) {
	dsn, err := DSNFromEnv()
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		// dsn にはパスワードが含まれるため、エラーに dsn を載せない。
		return nil, fmt.Errorf("DB 接続プールの生成に失敗（POSTGRES_* を確認）: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("DB へ到達できない（DB 起動と POSTGRES_* を確認）: %w", err)
	}
	return pool, nil
}
