package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/y-ssk/machilens/internal/store"
)

// stubValueLister は DB を介さず固定の行を返す（応答組み立ての健全性を隔離して検証する）。
type stubValueLister struct {
	rows []store.ListMetricValuesRow
	err  error
}

func (s stubValueLister) ListMetricValues(context.Context, store.ListMetricValuesParams) ([]store.ListMetricValuesRow, error) {
	return s.rows, s.err
}

// 代表行：present(値あり)・present(値0＝該当なし)・none(NULL)・suppressed(NULL) の4種で
// pgtype.Float8 → *float64（null可）の変換と status 同梱を確かめる（ADR-0011 データなし3区別）。
func TestBuildMetricValues(t *testing.T) {
	t.Parallel()
	rows := []store.ListMetricValuesRow{
		{Code: "13101", Value: pgtype.Float8{Float64: 11.64, Valid: true}, Status: "present"},
		{Code: "13102", Value: pgtype.Float8{Float64: 0, Valid: true}, Status: "present"}, // 該当なし=0
		{Code: "13103", Value: pgtype.Float8{Valid: false}, Status: "none"},               // データなし
		{Code: "13104", Value: pgtype.Float8{Valid: false}, Status: "suppressed"},         // 秘匿
	}

	out := buildMetricValues(rows)
	if len(out) != 4 {
		t.Fatalf("件数 = %d, want 4", len(out))
	}

	// present(値あり)：ポインタが非 nil で値が一致。
	if out[0].Value == nil || *out[0].Value != 11.64 || out[0].Status != "present" {
		t.Errorf("行0 = %+v, want value=11.64 status=present", out[0])
	}
	// 該当なし=0：value は 0（null ではない）・present。「危険ゼロ」と「未調査」を混同しない核。
	if out[1].Value == nil || *out[1].Value != 0 || out[1].Status != "present" {
		t.Errorf("行1（該当なし=0）= %+v, want value=0 status=present", out[1])
	}
	// データなし：value=null・status=none。
	if out[2].Value != nil || out[2].Status != "none" {
		t.Errorf("行2（データなし）= %+v, want value=nil status=none", out[2])
	}
	// 秘匿：value=null・status=suppressed。
	if out[3].Value != nil || out[3].Status != "suppressed" {
		t.Errorf("行3（秘匿）= %+v, want value=nil status=suppressed", out[3])
	}

	// JSON へ通し、null と数値が正しく出ること（FE が status と合わせて色抜きを判定できる）。
	b, err := json.Marshal(out)
	if err != nil {
		t.Fatalf("marshal 失敗: %v", err)
	}
	want := `[{"code":"13101","value":11.64,"status":"present"},` +
		`{"code":"13102","value":0,"status":"present"},` +
		`{"code":"13103","value":null,"status":"none"},` +
		`{"code":"13104","value":null,"status":"suppressed"}]`
	if string(b) != want {
		t.Errorf("JSON = %s\nwant %s", b, want)
	}
}

// 0 件でも null でなく [] になること（FE が常に配列として扱える）。
func TestBuildMetricValuesEmpty(t *testing.T) {
	t.Parallel()
	b, err := json.Marshal(buildMetricValues(nil))
	if err != nil {
		t.Fatalf("marshal 失敗: %v", err)
	}
	if string(b) != `[]` {
		t.Errorf("空の出力 = %s, want []", b)
	}
}

// ハンドラの形：metric 指定の正常時 200・Content-Type・配列を返すこと。
func TestValuesHandlerOK(t *testing.T) {
	t.Parallel()
	h := Values(stubValueLister{rows: []store.ListMetricValuesRow{
		{Code: "13101", Value: pgtype.Float8{Float64: 11.64, Valid: true}, Status: "present"},
	}})

	req := httptest.NewRequest(http.MethodGet, "/api/choropleth/values?metric=area_km2", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Errorf("Content-Type = %q", ct)
	}
	var got []metricValue
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("body が JSON でない: %v（body=%s）", err, rec.Body.String())
	}
	if len(got) != 1 || got[0].Code != "13101" {
		t.Errorf("body = %s", rec.Body.String())
	}
}

// ハンドラの形：metric 未指定は 400（どの指標か決まらない）。
func TestValuesHandlerMissingMetric(t *testing.T) {
	t.Parallel()
	// 呼ばれないはずだが、呼ばれたら気づけるよう err を仕込む（400 で store へ到達しないこと）。
	h := Values(stubValueLister{err: errors.New("到達してはならない")})

	req := httptest.NewRequest(http.MethodGet, "/api/choropleth/values", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

// ハンドラの形：store 失敗時 500・本文に秘匿（接続情報）を漏らさないこと。
func TestValuesHandlerError(t *testing.T) {
	t.Parallel()
	h := Values(stubValueLister{err: errors.New("host=secret password=leak これは漏れてはならない")})

	req := httptest.NewRequest(http.MethodGet, "/api/choropleth/values?metric=area_km2", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", rec.Code)
	}
	if body := rec.Body.String(); contains(body, "password") || contains(body, "host=") {
		t.Errorf("エラー本文に接続情報が漏れている: %q", body)
	}
}
