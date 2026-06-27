package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/y-ssk/machilens/internal/store"
)

// stubKarteStore は DB を介さず固定の単位・指標行を返す（応答組み立てを隔離して検証する）。
// unitErr / metricsErr で失敗経路（404・500）も試せる。
type stubKarteStore struct {
	unit       store.GetAdminUnitRow
	unitErr    error
	metrics    []store.ListUnitMetricsRow
	metricsErr error
}

func (s stubKarteStore) GetAdminUnit(context.Context, store.GetAdminUnitParams) (store.GetAdminUnitRow, error) {
	return s.unit, s.unitErr
}

func (s stubKarteStore) ListUnitMetrics(context.Context, store.ListUnitMetricsParams) ([]store.ListUnitMetricsRow, error) {
	return s.metrics, s.metricsErr
}

// 代表行：present(値+年度なし)・present(値+到達年=推計)・none(NULL)・suppressed(NULL) で、
// pgtype.Float8/Int4 → *float64/*int32（null可）の変換と status/year/source 同梱を確かめる（ADR-0011/0009）。
func TestBuildKarte(t *testing.T) {
	t.Parallel()
	unit := store.GetAdminUnitRow{Code: "13101", Name: "千代田区", PrefCode: "13"}
	rows := []store.ListUnitMetricsRow{
		{
			Metric: "area_km2",
			Value:  pgtype.Float8{Float64: 11.64, Valid: true},
			Status: "present",
			Year:   pgtype.Int4{Valid: false}, // 面積は年度を持たない
			Source: "出典：国土数値情報 行政区域データ（N03）より算出",
		},
		{
			Metric: "pop_change_rate_2020_2050",
			Value:  pgtype.Float8{Float64: 0.197, Valid: true},
			Status: "present",
			Year:   pgtype.Int4{Int32: 2050, Valid: true}, // 推計の到達年（ADR-0009）
			Source: "出典：将来推計人口250mメッシュ（XKT013）／推計（2020→2050）",
		},
		{
			Metric: "school_count", // 仮の指標（データなしの表示分け確認）
			Value:  pgtype.Float8{Valid: false},
			Status: "none",
			Year:   pgtype.Int4{Valid: false},
			Source: "出典：（未整備）",
		},
		{
			Metric: "pop_mesh_secret",
			Value:  pgtype.Float8{Valid: false},
			Status: "suppressed",
			Year:   pgtype.Int4{Int32: 2050, Valid: true},
			Source: "出典：将来推計人口250mメッシュ（XKT013）／秘匿",
		},
	}

	out := buildKarte(unit, rows)

	if out.Code != "13101" || out.Name != "千代田区" || out.PrefCode != "13" {
		t.Errorf("単位情報 = %+v, want code=13101 name=千代田区 pref=13", out)
	}
	if len(out.Metrics) != 4 {
		t.Fatalf("指標件数 = %d, want 4", len(out.Metrics))
	}

	// present(値あり・年度なし)：value 非 nil・year nil。
	if out.Metrics[0].Value == nil || *out.Metrics[0].Value != 11.64 || out.Metrics[0].Year != nil {
		t.Errorf("指標0（面積）= %+v, want value=11.64 year=nil", out.Metrics[0])
	}
	// present(値あり・到達年=推計)：value 非 nil・year=2050。
	if out.Metrics[1].Value == nil || out.Metrics[1].Year == nil || *out.Metrics[1].Year != 2050 {
		t.Errorf("指標1（人口増減）= %+v, want value!=nil year=2050", out.Metrics[1])
	}
	// データなし：value=null・status=none。「危険ゼロ」と「未調査」を混同しない核（ADR-0011）。
	if out.Metrics[2].Value != nil || out.Metrics[2].Status != "none" {
		t.Errorf("指標2（データなし）= %+v, want value=nil status=none", out.Metrics[2])
	}
	// 秘匿：value=null・status=suppressed。
	if out.Metrics[3].Value != nil || out.Metrics[3].Status != "suppressed" {
		t.Errorf("指標3（秘匿）= %+v, want value=nil status=suppressed", out.Metrics[3])
	}

	// JSON へ通し、null/数値・year の null/数値が正しく出ること（FE が status/year と合わせて表示し分ける）。
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatalf("marshal 失敗: %v", err)
	}
	got := string(b)
	// 出典は法的要件ゆえ全項目に出ること（ADR-0011 (c)）。
	for _, want := range []string{
		`"code":"13101"`, `"name":"千代田区"`, `"pref_code":"13"`,
		`"value":11.64`, `"year":null`, `"value":0.197`, `"year":2050`,
		`"value":null,"status":"none"`, `"status":"suppressed"`,
		`より算出`, `推計（2020→2050）`,
	} {
		if !contains(got, want) {
			t.Errorf("JSON に %q が無い\ngot %s", want, got)
		}
	}
}

// 指標0件でも metrics は null でなく [] になること（FE が常に配列として扱える）。
func TestBuildKarteNoMetrics(t *testing.T) {
	t.Parallel()
	out := buildKarte(store.GetAdminUnitRow{Code: "13421", Name: "三宅村", PrefCode: "13"}, nil)
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatalf("marshal 失敗: %v", err)
	}
	if !contains(string(b), `"metrics":[]`) {
		t.Errorf("指標なしの出力に metrics:[] が無い: %s", b)
	}
}

// ハンドラの形：正常時 200・Content-Type・name と metrics を返すこと。
func TestKarteHandlerOK(t *testing.T) {
	t.Parallel()
	h := Karte(stubKarteStore{
		unit: store.GetAdminUnitRow{Code: "13101", Name: "千代田区", PrefCode: "13"},
		metrics: []store.ListUnitMetricsRow{
			{Metric: "area_km2", Value: pgtype.Float8{Float64: 11.64, Valid: true}, Status: "present", Source: "N03"},
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/karte?unit_id=13101", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Errorf("Content-Type = %q", ct)
	}
	var got karteResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("body が JSON でない: %v（body=%s）", err, rec.Body.String())
	}
	if got.Name != "千代田区" || len(got.Metrics) != 1 {
		t.Errorf("body = %s", rec.Body.String())
	}
}

// ハンドラの形：unit_id 未指定は 400（どの単位か決まらない・store へ到達しない）。
func TestKarteHandlerMissingUnitID(t *testing.T) {
	t.Parallel()
	h := Karte(stubKarteStore{unitErr: errors.New("到達してはならない")})

	req := httptest.NewRequest(http.MethodGet, "/api/karte", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

// ハンドラの形：不正な unit_id（5桁数字でない）は 400（形を先に弾く・DB 往復しない）。
func TestKarteHandlerMalformedUnitID(t *testing.T) {
	t.Parallel()
	h := Karte(stubKarteStore{unitErr: errors.New("到達してはならない")})

	for _, bad := range []string{"1310", "131011", "1310a", "abcde"} {
		req := httptest.NewRequest(http.MethodGet, "/api/karte?unit_id="+bad, nil)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("unit_id=%q status = %d, want 400", bad, rec.Code)
		}
	}
}

// ハンドラの形：実在しない単位（pgx.ErrNoRows）は 404。本文に接続情報を漏らさない。
func TestKarteHandlerNotFound(t *testing.T) {
	t.Parallel()
	h := Karte(stubKarteStore{unitErr: pgx.ErrNoRows})

	req := httptest.NewRequest(http.MethodGet, "/api/karte?unit_id=99999", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

// ハンドラの形：store 失敗時 500・本文に秘匿（接続情報）を漏らさないこと。
func TestKarteHandlerError(t *testing.T) {
	t.Parallel()
	h := Karte(stubKarteStore{unitErr: errors.New("host=secret password=leak これは漏れてはならない")})

	req := httptest.NewRequest(http.MethodGet, "/api/karte?unit_id=13101", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if body := rec.Body.String(); contains(body, "password") || contains(body, "host=") {
		t.Errorf("エラー本文に接続情報が漏れている: %q", body)
	}
}
