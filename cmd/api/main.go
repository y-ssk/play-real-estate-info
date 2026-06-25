// Command api は一体型サーバの入口（随時側）。
//
// 役割（docs/02 §1・§6）：分析/カルテ API・タイル配信・embed した FE 配信を1プロセスで担う。
// 段0 時点ではデータ層が無いため、健全性確認エンドポイントと FE 静的配信（embed）の
// 配線のみ。ルート登録は本ファイル（起動側）に集約する（ADR-0020・backend-conventions §4）。
package main

import (
	"context"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"

	machilens "github.com/y-ssk/machilens"
	"github.com/y-ssk/machilens/internal/db"
	"github.com/y-ssk/machilens/internal/handler"
	"github.com/y-ssk/machilens/internal/store"
)

func main() {
	addr := os.Getenv("API_ADDR")
	if addr == "" {
		// なぜ既定をローカル限定にしないか：開発は Rsbuild 開発サーバからの
		// プロキシ先になるため、コンテナ/ホスト両対応で全インタフェース待受にする。
		addr = ":8080"
	}

	// 接続プールは起動時に作り到達性を確かめる（env 未設定・DB 未起動はここで分かりやすく落とす）。
	// 失敗時のエラーには接続情報を載せない（db.NewPool の作法）。プロセス終了まで保持する。
	pool, err := db.NewPool(context.Background())
	if err != nil {
		log.Fatalf("db init failed: %v", err)
	}
	defer pool.Close()

	mux := http.NewServeMux()
	registerRoutes(mux, store.New(pool))

	log.Printf("machilens api: listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("server stopped: %v", err)
	}
}

// registerRoutes は全ルートを1箇所で登録する（ADR-0020：ルート登録は起動側に集約）。
//
// ルート：
//   - GET /api/health … 活性確認（handler 層）
//   - GET /api/choropleth/geometry … 市区町村境界（GeoJSON FeatureCollection・値なし・ADR-0016）
//   - GET /          … embed した FE 成果物を配信（本番のみ。開発は Rsbuild 開発サーバ）
func registerRoutes(mux *http.ServeMux, queries *store.Queries) {
	mux.Handle("GET /api/health", handler.Health())
	mux.Handle("GET /api/choropleth/geometry", handler.Geometry(queries))

	if fe, err := frontendHandler(); err != nil {
		// FE 未ビルド（web/dist が空＝.gitkeep のみ）でも API は動くべきなので、
		// 落とさず案内ページに差し替える（段0 の FE は別途 Rsbuild 開発サーバで見る）。
		log.Printf("frontend not embedded (dev mode expected): %v", err)
		mux.Handle("GET /", devPlaceholder())
	} else {
		mux.Handle("GET /", fe)
	}
}

// frontendHandler は embed した web/dist を配信するハンドラを返す。
//
// なぜ index.html の有無を確認するか：embed は常に成功する（.gitkeep だけでも fs は得られる）
// ため、実成果物が入っているかは index.html の存在で判定する。未ビルドなら呼び出し側が
// 開発用プレースホルダへ切り替えられるよう error を返す。
func frontendHandler() (http.Handler, error) {
	dist, err := machilens.WebDist()
	if err != nil {
		return nil, err
	}
	if _, err := fs.Stat(dist, "index.html"); err != nil {
		return nil, errors.New("web/dist/index.html not built")
	}
	return http.FileServerFS(dist), nil
}

// devPlaceholder は FE 未ビルド時の最小案内を返す（本番では到達しない経路）。
func devPlaceholder() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("MachiLens API is running. FE は開発時 Rsbuild 開発サーバ（pnpm --filter web dev）で表示します。\n"))
	})
}
