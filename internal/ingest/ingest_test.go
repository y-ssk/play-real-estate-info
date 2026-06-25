package ingest

import "testing"

// looksJapanese は文字化け検出のスモーク判定（assert の層1検証で使う）。
// 日本語（漢字/かな）を含めば真、ASCII/別言語の記号列のみなら偽になることを確かめる。
func TestLooksJapanese(t *testing.T) {
	t.Parallel()
	cases := []struct {
		name string
		in   string
		want bool
	}{
		{"漢字の市区町村名", "千代田区", true},
		{"ひらがな混じり", "あきる野市", true},
		{"カタカナ", "コザ", true},
		{"ASCIIのみ（文字化けの疑い）", "Chiyoda", false},
		{"空文字", "", false},
		{"記号のみ（化け）", "????", false},
	}
	for _, c := range cases {
		c := c
		t.Run(c.name, func(t *testing.T) {
			t.Parallel()
			if got := looksJapanese(c.in); got != c.want {
				t.Errorf("looksJapanese(%q) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

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
			if !contains(dsn, want) {
				t.Errorf("DSN に %q が含まれない: %q", want, dsn)
			}
		}
	})
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
