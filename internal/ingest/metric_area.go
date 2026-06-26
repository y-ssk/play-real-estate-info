package ingest

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// areaMetricKey は面積指標の metric キー。値API（?metric=area_km2）と一致させる。
const areaMetricKey = "area_km2"

// areaSource は面積指標の出典（ADR-0011 (c) 法的要件）。
//
// 面積は取得データそのものではなく admin_unit の境界（N03 由来）から算出した派生値。出典には
// 「算出元」と「算出方法」を残す＝由来をたどれるようにする（黙って数値だけ出さない）。
const areaSource = "国土数値情報 行政区域データ（N03）より ST_Area(geography) で算出"

// MetricResult は metric 投入の結果要約（ログ・層1検証用）。
type MetricResult struct {
	Metric   string  // 投入した指標キー（例 area_km2）
	Inserted int     // metric_value へ投入した行数（>0 を期待＝admin_unit 件数と一致）
	MinValue float64 // 最小値（層1：負や0が無いか）
	MaxValue float64 // 最大値（層1：桁外れが無いか）
}

// ComputeAreaKm2 は admin_unit の境界から市区町村面積(km²)を算出し metric_value へ書き込む（冪等）。
//
// 設計（ADR-0015 縦持ち集計・ADR-0014 面積は geography）：面積は取得データではなく既存境界からの
// 派生値ゆえ MLIT API も鍵も要らず DB 接続のみで完結する＝「値の道」（metric_value→/values→
// setFeatureState→面塗り）を取得や鍵の不確実性なしに端から端まで通すための実証指標。
//
// 算出：ST_Area(geom::geography)/1e6。geography は球面で実面積を返すため m² で出る（ADR-0014：面積率は
// 比なので頑健、ここは実面積ゆえ geography で球面実面積を取り km² へ）。
// 冪等：metric 単位で DELETE→INSERT（何度流しても同結果・ETL要件）。pref をまたいで全単位を一括算出する
// （面積は境界さえあれば県に依らず算出できるため、N03 正規化と違い pref 単位に割らない）。
// year は NULL（面積に年度の概念を持たせない＝metric_value の year NULL 許容を使う・ADR-0015）。
// status は全行 present（境界がある＝必ず実面積が出る。データなし/秘匿は面積では発生しない）。
func ComputeAreaKm2(ctx context.Context, dsn string) (MetricResult, error) {
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		// dsn にはパスワードが含まれるため、エラーに dsn を載せない（端末/ログに漏らさない）。
		return MetricResult{}, fmt.Errorf("DB へ接続できない（POSTGRES_* と DB 起動を確認）: %w", err)
	}
	defer conn.Close(ctx)

	tx, err := conn.Begin(ctx)
	if err != nil {
		return MetricResult{}, fmt.Errorf("トランザクション開始に失敗: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // commit 済みなら no-op

	// 指標単位の入れ替え（DELETE→INSERT）。$1=metric。値は必ず引数化（§1.3）。
	if _, err := tx.Exec(ctx, `DELETE FROM metric_value WHERE metric = $1`, areaMetricKey); err != nil {
		return MetricResult{}, fmt.Errorf("既存 metric_value(metric=%s) の削除に失敗: %w", areaMetricKey, err)
	}

	// admin_unit の各単位について実面積(km²)を算出して縦持ち1行ずつ入れる。
	// unit_kind は admin_unit の値をそのまま引き継ぐ（municipality↔mesh 差し替えに追従・ADR-0015）。
	// year は NULL（面積に年度なし）。status は present・value は実面積。source に算出由来を残す。
	// 形は固定（実行時に形が変わらない）ゆえ sqlc 既定で書けるが、ETL の一括書き込みは ingest に集約する
	// 方が見通しがよく（cmd/ingest が唯一の書き手）、件数も数百で COPY を要さないため pgx 直の INSERT...SELECT とする。
	const insertSQL = `
INSERT INTO metric_value (unit_id, unit_kind, metric, value, status, year, source)
SELECT code,
       unit_kind,
       $1,
       ST_Area(geom::geography) / 1e6,
       'present',
       NULL,
       $2
FROM admin_unit
WHERE geom IS NOT NULL`
	tag, err := tx.Exec(ctx, insertSQL, areaMetricKey, areaSource)
	if err != nil {
		return MetricResult{}, fmt.Errorf("metric_value への面積 INSERT に失敗（admin_unit に境界が投入済みか確認）: %w", err)
	}
	inserted := int(tag.RowsAffected())

	res, err := assertArea(ctx, tx, inserted)
	if err != nil {
		// 層1チェック失敗はロールバック（defer）＝壊れた値を残さない。
		return MetricResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return MetricResult{}, fmt.Errorf("コミットに失敗: %w", err)
	}
	return res, nil
}

// assertArea は面積投入の事後チェック（層1＝データの正しさ）。失敗は具体的な値付きで返す。
//
// 検証項目：(1) 投入件数>0 (2) 全 value が正（面積は 0 以下になり得ない＝0/負は算出バグの兆候）
// (3) 最大値が現実的な上限内（市区町村が地球規模の桁にならない）。値域チェックは ADR-0014/backend §1.5。
func assertArea(ctx context.Context, tx pgx.Tx, inserted int) (MetricResult, error) {
	if inserted <= 0 {
		return MetricResult{}, fmt.Errorf("投入件数が0。admin_unit に境界（geom）が投入済みか確認（先に make ingest-n03）")
	}

	// 値域：最小・最大を取り、負/0 と桁外れを弾く。NULL は present なら CHECK で入らない想定だが念のため数える。
	var minV, maxV float64
	var nullCount int
	if err := tx.QueryRow(ctx, `
SELECT min(value), max(value),
       count(*) FILTER (WHERE value IS NULL)
FROM metric_value
WHERE metric = $1`, areaMetricKey).Scan(&minV, &maxV, &nullCount); err != nil {
		return MetricResult{}, fmt.Errorf("面積の値域集計に失敗: %w", err)
	}
	if nullCount != 0 {
		return MetricResult{}, fmt.Errorf("present なのに value が NULL の行が %d 件ある（算出漏れ）", nullCount)
	}
	if minV <= 0 {
		return MetricResult{}, fmt.Errorf("面積に 0 以下の値がある（min=%g km²）。境界 geom か算出式を確認", minV)
	}
	// 上限の目安：日本最大の市区町村（高山市≒2178km²）を大きく超える桁（例 1e5）は算出単位の取り違え兆候。
	const sanityMaxKm2 = 100000
	if maxV > sanityMaxKm2 {
		return MetricResult{}, fmt.Errorf("面積が現実的上限(%dkm²)を超える（max=%g km²）。/1e6 の単位変換を確認", sanityMaxKm2, maxV)
	}

	return MetricResult{
		Metric:   areaMetricKey,
		Inserted: inserted,
		MinValue: minV,
		MaxValue: maxV,
	}, nil
}
