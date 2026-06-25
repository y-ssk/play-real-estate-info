package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/y-ssk/machilens/internal/store"
)

// stubLister は DB を介さず固定の行を返す（FeatureCollection 組み立ての健全性を隔離して検証する）。
type stubLister struct {
	rows []store.ListMunicipalityGeometryRow
	err  error
}

func (s stubLister) ListMunicipalityGeometry(context.Context) ([]store.ListMunicipalityGeometryRow, error) {
	return s.rows, s.err
}

// 代表行：geometry はオブジェクト（GeoJSON Geometry）として埋まり、文字列に再エンコードされないこと、
// id=code・properties が識別情報のみであることを確かめる。
func TestBuildFeatureCollection(t *testing.T) {
	t.Parallel()
	rows := []store.ListMunicipalityGeometryRow{
		{Code: "13101", Name: "千代田区", Geojson: `{"type":"MultiPolygon","coordinates":[[[[139.0,35.0],[139.1,35.0],[139.1,35.1],[139.0,35.0]]]]}`},
		{Code: "13102", Name: "中央区", Geojson: `{"type":"MultiPolygon","coordinates":[[[[139.2,35.0],[139.3,35.0],[139.3,35.1],[139.2,35.0]]]]}`},
	}

	fc := buildFeatureCollection(rows)
	if fc.Type != "FeatureCollection" {
		t.Errorf("type = %q, want FeatureCollection", fc.Type)
	}
	if len(fc.Features) != 2 {
		t.Fatalf("features 数 = %d, want 2", len(fc.Features))
	}

	// JSON へ通して構造を検証（geometry が二重エンコードされていないか＝オブジェクトのままか）。
	b, err := json.Marshal(fc)
	if err != nil {
		t.Fatalf("marshal 失敗: %v", err)
	}
	var got struct {
		Type     string `json:"type"`
		Features []struct {
			Type     string          `json:"type"`
			ID       string          `json:"id"`
			Geometry json.RawMessage `json:"geometry"`
			Props    struct {
				Code string `json:"code"`
				Name string `json:"name"`
			} `json:"properties"`
		} `json:"features"`
	}
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("unmarshal 失敗: %v（出力=%s）", err, b)
	}

	f0 := got.Features[0]
	if f0.Type != "Feature" {
		t.Errorf("feature.type = %q, want Feature", f0.Type)
	}
	if f0.ID != "13101" {
		t.Errorf("feature.id = %q, want 13101（setFeatureState 結合キー）", f0.ID)
	}
	if f0.Props.Code != "13101" || f0.Props.Name != "千代田区" {
		t.Errorf("properties = %+v, want code=13101 name=千代田区", f0.Props)
	}

	// geometry が「文字列」ではなく GeoJSON オブジェクトとして埋まっていること（二重エンコード回避の核）。
	var geom struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	}
	if err := json.Unmarshal(f0.Geometry, &geom); err != nil {
		t.Fatalf("geometry がオブジェクトとして読めない（二重エンコードの疑い）: %v（geometry=%s）", err, f0.Geometry)
	}
	if geom.Type != "MultiPolygon" {
		t.Errorf("geometry.type = %q, want MultiPolygon", geom.Type)
	}
}

// 0 件でも features は null でなく [] になること（FE が常に配列として扱える）。
func TestBuildFeatureCollectionEmpty(t *testing.T) {
	t.Parallel()
	fc := buildFeatureCollection(nil)
	b, err := json.Marshal(fc)
	if err != nil {
		t.Fatalf("marshal 失敗: %v", err)
	}
	want := `{"type":"FeatureCollection","features":[]}`
	if string(b) != want {
		t.Errorf("空の出力 = %s, want %s", b, want)
	}
}

// ハンドラの形：正常時 200・Content-Type・FeatureCollection を返すこと。
func TestGeometryHandlerOK(t *testing.T) {
	t.Parallel()
	h := Geometry(stubLister{rows: []store.ListMunicipalityGeometryRow{
		{Code: "13101", Name: "千代田区", Geojson: `{"type":"MultiPolygon","coordinates":[]}`},
	}})

	req := httptest.NewRequest(http.MethodGet, "/api/choropleth/geometry", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Errorf("Content-Type = %q", ct)
	}
	var fc struct {
		Type     string `json:"type"`
		Features []any  `json:"features"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &fc); err != nil {
		t.Fatalf("body が JSON でない: %v（body=%s）", err, rec.Body.String())
	}
	if fc.Type != "FeatureCollection" || len(fc.Features) != 1 {
		t.Errorf("body = %s", rec.Body.String())
	}
}

// ハンドラの形：store 失敗時 500・本文に秘匿（接続情報）を漏らさないこと。
func TestGeometryHandlerError(t *testing.T) {
	t.Parallel()
	h := Geometry(stubLister{err: errors.New("host=secret password=leak これは漏れてはならない")})

	req := httptest.NewRequest(http.MethodGet, "/api/choropleth/geometry", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if body := rec.Body.String(); contains(body, "password") || contains(body, "host=") {
		t.Errorf("エラー本文に接続情報が漏れている: %q", body)
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}
