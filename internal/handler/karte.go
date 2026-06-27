package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/y-ssk/machilens/internal/store"
)

// karteStore はカルテ取得の依存（store を直接持たずインタフェースで受ける）。
//
// なぜインタフェースか：応答組み立て（単位の実在判定・指標行の null 可数値変換・year/status 同梱）の
// 健全性を DB 非依存の単体テストで確かめるため（stub を流せる）。実体は sqlc 生成の *store.Queries が満たす（§1.5）。
type karteStore interface {
	GetAdminUnit(ctx context.Context, arg store.GetAdminUnitParams) (store.GetAdminUnitRow, error)
	ListUnitMetrics(ctx context.Context, arg store.ListUnitMetricsParams) ([]store.ListUnitMetricsRow, error)
}

// karteResponse はカルテ1単位ぶんの応答（ADR-0011 骨組み）。
//
// 値（指標）はこの単位の全分野を縦に並べる＝指標が増えればこの配列が伸びる（ADR-0011 を比較で再利用できる形）。
// 名称は表示用（結合はコード・ADR-0014）。出典/推計/データなし3区別は各 metric が status/year/source で運ぶ。
type karteResponse struct {
	Code     string        `json:"code"`      // 5桁市区町村コード（選択単位の unit_id）
	Name     string        `json:"name"`      // 表示名（例：千代田区）
	PrefCode string        `json:"pref_code"` // 都県コード（code 上2桁）
	Metrics  []karteMetric `json:"metrics"`   // 当該単位の全指標（0 件でも [] を返す）
}

// karteMetric はカルテに並ぶ1指標ぶん。
//
// Value を *float64 にする理由：データなし3区別（ADR-0011）を JSON で運ぶため。status!='present' は
// value=null になり、FE は status で「データなし／秘匿」を表示し分ける（該当なし＝0 は value=0・status=present）。
// Year を *int32 にする理由：面積のように年度を持たない指標は null（XKT013 の推計到達年 2050 は値を持つ＝
// 推計の基準年を FE が示せる・ADR-0009）。Source は法的要件ゆえ常に文字列（ADR-0011 (c)）。
type karteMetric struct {
	Metric string   `json:"metric"` // 指標キー（FE registry の表示名・単位・整形に対応）
	Value  *float64 `json:"value"`  // 数値 or null（null＝データなし/秘匿）
	Status string   `json:"status"` // present / none / suppressed（ADR-0011）
	Year   *int32   `json:"year"`   // 年度 or null（指標の版。推計は到達年・ADR-0009）
	Source string   `json:"source"` // 出典（法的要件・ADR-0011 (c)）。推計は文言に「推計」を含む
}

// karteUnitIDPattern は unit_id の値域（5桁数字）。admin_unit/metric_value の CHECK と同基準（ADR-0014）。
//
// 形を先に弾く理由：不正な値で store を叩いても 404 になるだけだが、明らかな形の誤りは 400 で原因を返す方が
// クライアントに親切（DB 往復も省ける）。コンパイル時に1度だけ生成する。
var karteUnitIDPattern = regexp.MustCompile(`^[0-9]{5}$`)

// Karte は選択した単位のカルテ（分野横断の詳細・ADR-0011）を返すハンドラを返す（GET /api/karte?unit_id=<code>）。
//
// 設計：選択単位は {unit_kind, unit_id} で受ける（ADR-0018 識別子の継ぎ目）。MVP は unit_kind を公開せず
// 内部既定（municipality）に固定し、メッシュ移行（ADR-0015）で引数を生やす（先回りで公開しない＝値配信と同作法）。
// SQL は持たず store を呼ぶ（§1.4/§4）。unit_id 未指定/不正は 400、実在しない単位は 404、それ以外の失敗は
// 500（接続情報など秘匿を漏らさない汎用メッセージ・他ハンドラと同作法）。
func Karte(q karteStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		unitID := r.URL.Query().Get("unit_id")
		if unitID == "" {
			// どの単位のカルテか決まらない＝クライアント側の誤り。秘匿は無いが原因を明示して返す。
			http.Error(w, "unit_id クエリパラメータが必要です", http.StatusBadRequest)
			return
		}
		if !karteUnitIDPattern.MatchString(unitID) {
			http.Error(w, "unit_id は5桁の数字です", http.StatusBadRequest)
			return
		}

		unit, err := q.GetAdminUnit(r.Context(), store.GetAdminUnitParams{
			Code:     unitID,
			UnitKind: defaultUnitKind,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// 実在しない単位＝404（形は正しいが該当が無い）。コードは出すが接続情報は出さない。
				http.Error(w, "指定された単位が見つかりません", http.StatusNotFound)
				return
			}
			log.Printf("karte: GetAdminUnit failed (unit_id=%s): %v", unitID, err)
			http.Error(w, "カルテの取得に失敗しました", http.StatusInternalServerError)
			return
		}

		rows, err := q.ListUnitMetrics(r.Context(), store.ListUnitMetricsParams{
			UnitID:   unitID,
			UnitKind: defaultUnitKind,
		})
		if err != nil {
			log.Printf("karte: ListUnitMetrics failed (unit_id=%s): %v", unitID, err)
			http.Error(w, "カルテの取得に失敗しました", http.StatusInternalServerError)
			return
		}

		out := buildKarte(unit, rows)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if err := json.NewEncoder(w).Encode(out); err != nil {
			// ヘッダ送出後の失敗は書き込み途中＝ステータス変更不可。ログのみ残す。
			log.Printf("karte: encode failed: %v", err)
		}
	}
}

// buildKarte は store 行をカルテ応答へ組む（DB 非依存・単体テスト対象）。
//
// なぜ純関数に切り出すか：pgtype.Float8/Int4（valid/null）→ *float64/*int32 の変換と status/year/source 同梱の
// 規則を DB なしで検証するため（§1.5 層1）。Valid=false（DB の NULL）は nil ポインタ＝JSON で null になり、
// FE がデータなし3区別（ADR-0011）と推計の基準年（ADR-0009）を表示し分けられる。指標0件でも非 nil（[]）にする。
func buildKarte(unit store.GetAdminUnitRow, rows []store.ListUnitMetricsRow) karteResponse {
	metrics := make([]karteMetric, 0, len(rows))
	for _, row := range rows {
		var v *float64
		if row.Value.Valid {
			// ローカル変数経由でポインタを取る（ループ変数のアドレス共有を避ける）。
			f := row.Value.Float64
			v = &f
		}
		var y *int32
		if row.Year.Valid {
			n := row.Year.Int32
			y = &n
		}
		metrics = append(metrics, karteMetric{
			Metric: row.Metric,
			Value:  v,
			Status: row.Status,
			Year:   y,
			Source: row.Source,
		})
	}
	return karteResponse{
		Code:     unit.Code,
		Name:     unit.Name,
		PrefCode: unit.PrefCode,
		Metrics:  metrics,
	}
}
