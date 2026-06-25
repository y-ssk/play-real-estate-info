// Package machilens は一体型配信のための embed 設定を持つ（ADR-0013）。
//
// なぜ root に置くか：go:embed は埋め込み元を「このファイルからの相対パス」でしか
// 辿れず、親ディレクトリ（..）を遡れない。FE 成果物 web/dist をバイナリへ畳み込むには
// web/ を見下ろせるリポジトリ直下にこのファイルを置く必要がある（cmd/api からは遡れない）。
package machilens

import (
	"embed"
	"io/fs"
)

// distFS は FE のビルド成果物（web/dist）を埋め込む。
//
// なぜ all: か：dist 配下には _ や . で始まる名（chunk・ソースマップ等）が出るため、
// 既定で除外される dotfile も含める all: 接頭辞を使う。
// 開発時は Rsbuild の開発サーバを使い、本番のみこの embed を配信する二段構え（ADR-0013）。
//
//go:embed all:web/dist
var distFS embed.FS

// WebDist は web/dist を dist 接頭辞を剥がした fs.FS として返す。
//
// なぜ Sub か：埋め込みは "web/dist/index.html" のようなパスで入るが、HTTP 配信時は
// ルート直下に index.html がある体裁にしたい。Sub で "web/dist" を根に付け替える。
// 段0 時点で web/dist が空（プレースホルダのみ）でもビルドを壊さないよう、最小の
// .gitkeep を web/dist に置いて埋め込み対象を必ず1つ以上にしている。
func WebDist() (fs.FS, error) {
	return fs.Sub(distFS, "web/dist")
}
