// Package handler は HTTP ハンドラを持つ。ルート登録は cmd/api に集約し、
// ハンドラは薄く保つ（SQL を持たず store を呼ぶだけ。backend-conventions §1.4/§4）。
//
// 段0 時点ではデータ層が無いため、健全性確認の最小ハンドラのみを置く。
package handler

import (
	"encoding/json"
	"net/http"
)

// Health は活性確認（liveness）の最小ハンドラを返す。
//
// なぜ DB を見ないか：段0 はプロセスが起動し応答することの確認が目的。
// DB 接続を含む準備性確認（readiness）はデータ層を入れる段1以降に足す
// （健全性確認の段階を分ける＝起動と依存準備の混同を避ける）。
func Health() http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}
