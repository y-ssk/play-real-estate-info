package handler

import (
	"context"
	"encoding/json"
	"log"
	"net/http"

	"github.com/y-ssk/machilens/internal/store"
)

// geometryLister は色分け形クエリの依存（store を直接持たずインタフェースで受ける）。
//
// なぜインタフェースか：FeatureCollection 組み立ての健全性を DB 非依存の単体テストで確かめるため
// （stub 行を流せる）。実体は sqlc 生成の *store.Queries が満たす（backend-conventions §1.5）。
type geometryLister interface {
	ListMunicipalityGeometry(ctx context.Context) ([]store.ListMunicipalityGeometryRow, error)
}

// featureCollection は GeoJSON FeatureCollection（RFC 7946）の最小表現。
// 値（指標）は別経路（ADR-0016 継ぎ目）ゆえ properties は識別情報のみ＝色塗りは FE が後段で行う。
type featureCollection struct {
	Type     string    `json:"type"`     // 常に "FeatureCollection"
	Features []feature `json:"features"` // 0 件でも null でなく [] を返す
}

// feature は1単位（市区町村）の境界。
//
// ID に5桁コードを入れる理由：FE は後段でこの id を使い setFeatureState で値を結合し塗る
// （ADR-0016・docs/02 §7）。geometry は store から来た GeoJSON テキストを生 JSON として埋める
// （json.RawMessage＝文字列として再エンコードしない＝二重エンコード回避）。
type feature struct {
	Type       string            `json:"type"` // 常に "Feature"
	ID         string            `json:"id"`   // 5桁市区町村コード（結合キー）
	Geometry   json.RawMessage   `json:"geometry"`
	Properties featureProperties `json:"properties"`
}

// featureProperties は塗り絵・カルテ表示に最低限要る識別情報（値は持たない・ADR-0016）。
type featureProperties struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

// Geometry は市区町村境界を GeoJSON FeatureCollection で返すハンドラを返す（GET /api/choropleth/geometry）。
//
// 設計（ADR-0016 初手＝ST_AsGeoJSON＋geojson source）：値を持たない形だけを配信する。SQL は持たず
// store を呼ぶ（backend-conventions §1.4/§4）。エラー時は秘匿（接続情報）を出さない汎用メッセージを返す。
func Geometry(q geometryLister) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := q.ListMunicipalityGeometry(r.Context())
		if err != nil {
			// 原因（DSN・内部 SQL）はサーバログのみ。クライアントには汎用メッセージ（秘匿を漏らさない）。
			log.Printf("geometry: ListMunicipalityGeometry failed: %v", err)
			http.Error(w, "境界データの取得に失敗しました", http.StatusInternalServerError)
			return
		}

		fc := buildFeatureCollection(rows)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if err := json.NewEncoder(w).Encode(fc); err != nil {
			// ヘッダ送出後の失敗は書き込み途中＝ステータス変更不可。ログのみ残す。
			log.Printf("geometry: encode failed: %v", err)
		}
	}
}

// buildFeatureCollection は store 行を FeatureCollection に組む（DB 非依存・単体テスト対象）。
//
// なぜ純関数に切り出すか：組み立て規則（id=code・geometry は二重エンコードしない・properties は識別のみ）を
// DB なしで検証可能にするため（backend-conventions §1.5 層1）。geojson 列は ST_AsGeoJSON のテキストゆえ
// そのまま RawMessage として埋める。0 件でも features を非 nil（[]）にして JSON が null にならないようにする。
func buildFeatureCollection(rows []store.ListMunicipalityGeometryRow) featureCollection {
	features := make([]feature, 0, len(rows))
	for _, row := range rows {
		features = append(features, feature{
			Type:     "Feature",
			ID:       row.Code,
			Geometry: json.RawMessage(row.Geojson),
			Properties: featureProperties{
				Code: row.Code,
				Name: row.Name,
			},
		})
	}
	return featureCollection{
		Type:     "FeatureCollection",
		Features: features,
	}
}
