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
