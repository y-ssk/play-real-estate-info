package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/y-ssk/machilens/internal/store"
)

// metricValueLister は値クエリの依存（store を直接持たずインタフェースで受ける）。
//
// なぜインタフェースか：応答組み立て（pgtype→null可数値の変換・status 同梱）の健全性を DB 非依存の
// 単体テストで確かめるため（stub 行を流せる）。実体は sqlc 生成の *store.Queries が満たす（§1.5）。
type metricValueLister interface {
	ListMetricValues(ctx context.Context, arg store.ListMetricValuesParams) ([]store.ListMetricValuesRow, error)
}

// metricValue は値配信の1単位ぶん（setFeatureState 向け）。
//
// Value を *float64 にする理由：データなし3区別（ADR-0011）を JSON で運ぶため。status!='present' は
// value=null になり、FE は status で「色抜き（none/suppressed）」を判定する。該当なし＝0 は value=0・status=present。
type metricValue struct {
	Code   string   `json:"code"`   // 5桁市区町村コード（FE の setFeatureState 結合キー）
	Value  *float64 `json:"value"`  // 数値 or null（null＝データなし/秘匿）
	Status string   `json:"status"` // present / none / suppressed（ADR-0011）
}

// defaultUnitKind は値配信の既定の単位種別（MVP＝市区町村）。
//
// メッシュ移行（ADR-0015）でクエリ引数化する継ぎ目。今は ?unit_kind= を公開せず内部既定に固定し、
// 'mesh250' を出す段で引数を生やす（先回りで公開しない＝YAGNI）。
const defaultUnitKind = "municipality"

// Values は指定 metric の全単位の値を返すハンドラを返す（GET /api/choropleth/values?metric=<key>）。
//
// 設計（ADR-0016 (i) 値とジオメトリの分離）：形（geometry）とは別経路で値だけを配信する。SQL は持たず
// store を呼ぶ（§1.4/§4）。metric 未指定/空は 400（どの指標か決まらないと引けない）。エラー時は秘匿
// （接続情報）を出さない汎用メッセージを返す（geometry ハンドラと同作法）。
func Values(q metricValueLister) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		metric := r.URL.Query().Get("metric")
		if metric == "" {
			// どの指標を引くか決まらない＝クライアント側の誤り。秘匿は無いが原因を明示して返す。
			http.Error(w, "metric クエリパラメータが必要です", http.StatusBadRequest)
			return
		}

		rows, err := q.ListMetricValues(r.Context(), store.ListMetricValuesParams{
			Metric:   metric,
			UnitKind: defaultUnitKind,
		})
		if err != nil {
			// 原因（DSN・内部 SQL）はサーバログのみ。クライアントには汎用メッセージ（秘匿を漏らさない）。
			log.Printf("values: ListMetricValues failed (metric=%s): %v", metric, err)
			http.Error(w, "指標値の取得に失敗しました", http.StatusInternalServerError)
			return
		}

		out := buildMetricValues(rows)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if err := json.NewEncoder(w).Encode(out); err != nil {
			// ヘッダ送出後の失敗は書き込み途中＝ステータス変更不可。ログのみ残す。
			log.Printf("values: encode failed: %v", err)
		}
	}
}

// buildMetricValues は store 行を配信形へ組む（DB 非依存・単体テスト対象）。
//
// なぜ純関数に切り出すか：pgtype.Float8（valid/null）→ *float64 の変換と status 同梱の規則を DB なしで
// 検証するため（§1.5 層1）。Valid=false（DB の NULL）は nil ポインタ＝JSON で null になり、FE が
// データなし3区別（ADR-0011）を status と合わせて判定できる。0 件でも非 nil（[]）にして null を避ける。
func buildMetricValues(rows []store.ListMetricValuesRow) []metricValue {
	out := make([]metricValue, 0, len(rows))
	for _, row := range rows {
		var v *float64
		if row.Value.Valid {
			// ローカル変数経由でポインタを取る（ループ変数のアドレス共有を避ける）。
			f := row.Value.Float64
			v = &f
		}
		out = append(out, metricValue{
			Code:   row.Code,
			Value:  v,
			Status: row.Status,
		})
	}
	return out
}
