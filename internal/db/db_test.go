package db

import (
	"strings"
	"testing"
)

// DSNFromEnv は POSTGRES_* 未設定で即エラー（握りつぶさない）、設定時は host/port を含む DSN を組むことを確かめる。
// パスワードは検査するがテスト用のダミー値のみ扱う（実値は使わない）。
func TestDSNFromEnv(t *testing.T) {
	t.Run("必須が欠けるとエラー", func(t *testing.T) {
		t.Setenv("POSTGRES_USER", "")
		t.Setenv("POSTGRES_PASSWORD", "")
		t.Setenv("POSTGRES_DB", "")
		if _, err := DSNFromEnv(); err == nil {
			t.Fatal("必須未設定なのにエラーにならなかった")
		}
	})

	t.Run("既定 host/port が補完される", func(t *testing.T) {
		t.Setenv("POSTGRES_USER", "machilens")
		t.Setenv("POSTGRES_PASSWORD", "dummy-local-pass")
		t.Setenv("POSTGRES_DB", "machilens")
		t.Setenv("POSTGRES_PORT", "")
		t.Setenv("POSTGRES_HOST", "")
		dsn, err := DSNFromEnv()
		if err != nil {
			t.Fatalf("予期せぬエラー: %v", err)
		}
		for _, want := range []string{"host=localhost", "port=5432", "dbname=machilens", "sslmode=disable"} {
			if !strings.Contains(dsn, want) {
				t.Errorf("DSN に %q が含まれない: %q", want, dsn)
			}
		}
	})
}
