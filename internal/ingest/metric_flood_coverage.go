package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

// floodMetricKey は洪水浸水想定区域(想定最大規模)の該当面積率の metric キー。
// 値API（?metric=...）・FE registry（web/src/features/choropleth/metrics.ts）と一致させる。
const floodMetricKey = "flood_area_coverage_rate"

// floodSource は本指標の出典（ADR-0011 (c) 法的要件）。国土数値情報 洪水浸水想定区域（想定最大規模・XKT026）
// 由来と、算出条件（区に重なる浸水面積÷区面積×100＝交差面積按分・ADR-0015）を残す＝由来と意味をたどれる
// ようにする（黙って数値だけ出さない）。想定最大規模は「起こり得る最大の浸水」で、実績ではなく想定である
// ことを版名で示す（断定しない・ADR-0009 と同思想）。
const floodSource = "国土数値情報 洪水浸水想定区域（想定最大規模）(XKT026)。市区町村ごとに 浸水域と区の交差面積÷区面積×100 で該当面積率(%)を算出（1都3県）"

// floodPrefixes は本スライスの対象エリア（1都3県）の pref コード上2桁（ADR-0030 波1）。
// 集計 SQL の母集合の絞り（left(code,2)=ANY）と実行後アサートに使う。他エリアは波でこのリストへ足す
// （land_price の landPricePrefixes・人口の popChangePrefixes と同流儀・コード本体は触らない）。
var floodPrefixes = []string{"11", "12", "13", "14"}

// FloodResult は洪水該当面積率投入の結果要約（ログ・層1検証用）。PopChangeResult と同型の骨格。
type FloodResult struct {
	Metric         string  // 投入指標キー
	Inserted       int     // metric_value へ投入した行数（present+none）
	Present        int     // status=present（対象エリアの区＝0% を含む）行数
	None           int     // status=none（取得対象外・値なし）行数
	PolygonsParsed int     // 一時テーブルへ載せた浸水ポリゴン数（タイル分割・境界重複を含む生数）
	MinRate        float64 // present の最小該当面積率(%)（層1：値域 0〜100 の下限）
	MaxRate        float64 // present の最大該当面積率(%)（層1：100超なら ST_Union 結合漏れ＝R1 破綻）
}

// floodPolygon は1タイルから只取りする浸水ポリゴンの geometry（GeoJSON のまま DB へ渡す中間形）。
//
// なぜ座標を Go 側でパースせず GeoJSON 文字列のまま持つか（land_price の点と違う点）：浸水域は Polygon
// （複数リング＝穴あき・分割あり・IF §3）で座標が数百〜。Go で座標を解いて WKT を組むのは誤りの温床ゆえ、
// geometry オブジェクトを生の GeoJSON テキストで保持し、PostGIS の ST_GeomFromGeoJSON に解釈させる
// （SRID は 6668 を明示付与・§4）。重複排除・結合はここでやらず SQL の ST_Union に委ねる（設計 note §4）。
type floodPolygon struct {
	geoJSON string
}

// floodAccumulator はタイルをまたいで浸水ポリゴンを集める蓄積器（只取り・重複排除しない）。
//
// なぜ重複排除しないか：タイル分割・境界重複は SQL の ST_Union(ST_Intersection(...)) で溶かす設計
// （設計 note §4・R1）。ここで点のような一意キーでの排除はできず（浸水域に安定 ID が無い＝_id は未文書・
// IF §3 注記）、パース段での排除は不要。全ポリゴンを一時テーブルへ載せ、結合は PostGIS 側に一元化する。
type floodAccumulator struct {
	polygons []floodPolygon
}

func newFloodAccumulator() *floodAccumulator {
	return &floodAccumulator{}
}

// floodFeatureGeom は1 Feature から geometry だけを只取りするための部分構造体。
//
// geometry の type と生 JSON（RawMessage）を受け、Polygon（IF §3：XKT026 は Polygon）だけ採用する。
// properties（河川番号・浸水深ランク等）は面積率に不要ゆえ Decode が読み捨てる（ストリーム抽出・
// metric_pop_change / land_price と同流儀。全属性をメモリに載せない）。
type floodFeatureGeom struct {
	Geometry struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	} `json:"geometry"`
}

// addTile は GeoJSON タイル1枚をストリームで読み、Polygon の geometry を蓄積器へ足す。
//
// seekToFeaturesArray で features 配列の開始まで降り（metric_pop_change から流用）、各 Feature を
// 部分構造体で復号して geometry の type/coordinates だけ取り出す。type!="Polygon" は捨てる（IF は
// Polygon だが防御）。coordinates 欠落も捨てる。採用分は `{"type":"Polygon","coordinates":...}` の
// GeoJSON 文字列に組み直して保持する（SRID は DB 側で 6668 を付与・§4）。
func (a *floodAccumulator) addTile(r io.Reader) error {
	dec := json.NewDecoder(r)
	if err := seekToFeaturesArray(dec); err != nil {
		return err
	}
	for dec.More() {
		var f floodFeatureGeom
		if err := dec.Decode(&f); err != nil {
			return fmt.Errorf("Feature の復号に失敗: %w", err)
		}
		a.addFeature(f)
	}
	return nil
}

// addFeature は1 Feature の geometry を Polygon に限って採用する（純ロジック・層1の核）。
func (a *floodAccumulator) addFeature(f floodFeatureGeom) {
	if f.Geometry.Type != "Polygon" {
		// XKT026 は Polygon（IF §3）。MultiPolygon 等が来たら想定外ゆえ採らない（取り違え検出の防御）。
		return
	}
	if len(f.Geometry.Coordinates) == 0 {
		return // 座標欠落は面を成さず捨てる。
	}
	// geometry を GeoJSON 文字列に組み直す（ST_GeomFromGeoJSON が解釈する形）。coordinates は生 JSON を
	// そのまま埋める＝座標を Go でパースし直さない（誤りの温床を避ける）。
	a.polygons = append(a.polygons, floodPolygon{
		geoJSON: `{"type":"Polygon","coordinates":` + string(f.Geometry.Coordinates) + `}`,
	})
}

// ComputeFloodAreaCoverage は data/xkt026/<year> 配下のタイル群を集計し、洪水浸水想定区域の該当面積率(%)を
// 市区町村ごとに metric_value へ書き込む（冪等・ADR-0006 該当面積率・ADR-0015 交差面積按分）。
//
// 設計（設計 note §1〜§4・姉妹 note §3〜§6）：
//   - タイル群をストリーム抽出（Polygon の geometry だけ只取り）→ 一時テーブル flood_poly(6668) へ COPY
//     ＋GiST 索引（重複排除はここでせず SQL の ST_Union に委ねる）。
//   - admin_unit(対象1都3県・municipality)を母集合に、区ごとに区に重なる浸水域を集めて
//     ST_Union(ST_Intersection(...)) で1枚に溶かしてから ::geography で面積を測り、区面積で割り×100
//     ＝該当面積率(%)。交差ゼロの区は COALESCE(...,0) で value=0・status='present'（R2：該当なし=0%と
//     データなしを区別。land_price の「点なし→none」は持ち込まない＝浸水想定が無い＝事実の0）。
//   - 冪等：metric 単位 DELETE→INSERT。TEMP は ON COMMIT DROP。実行後アサート（0〜100・present>0・
//     pref・status整合）で層1を守る。
//
// dataDir は data/xkt026/<year>（pref サブディレクトリ配下にタイルが並ぶ）を再帰探索する（land_price と
// 同流儀）。鍵・取得は要らず（ファイルは fetch-xkt026.sh が用意済み）DB 接続のみ＝層1検証を取得の
// 不確実性から切り離す。year は metric_value.year へ入れる版（XKT026 の版年＝取得ディレクトリ名）。
func ComputeFloodAreaCoverage(ctx context.Context, dsn, dataDir string, year int) (FloodResult, error) {
	if year < 2000 || year > 2100 {
		// XKT026 の版年（例 2024）。取り違え（0・桁違い）を早期に弾く。
		return FloodResult{}, fmt.Errorf("year が不正（%d）。XKT026 の版年（例 2024）を指定する", year)
	}
	acc, err := aggregateFloodDir(dataDir)
	if err != nil {
		return FloodResult{}, err
	}

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		// dsn にはパスワードが含まれるため、エラーに dsn を載せない。
		return FloodResult{}, fmt.Errorf("DB へ接続できない（POSTGRES_* と DB 起動を確認）: %w", err)
	}
	defer conn.Close(ctx)

	tx, err := conn.Begin(ctx)
	if err != nil {
		return FloodResult{}, fmt.Errorf("トランザクション開始に失敗: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // commit 済みなら no-op

	res, err := writeFloodCoverage(ctx, tx, acc, year)
	if err != nil {
		return FloodResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return FloodResult{}, fmt.Errorf("コミットに失敗: %w", err)
	}
	return res, nil
}

// aggregateFloodDir は dataDir 配下（サブディレクトリ含む）の *.geojson を1枚ずつストリーム集計する。
//
// 配置規約 data/xkt026/<year>/<pref>/z14_x_y.geojson ゆえ再帰的に集める（pref をまたいで全ポリゴンを1蓄積器へ）。
// 交差 SQL で区（したがって pref）を判定するため、ここでは pref を区別せず全ポリゴンを載せる（県外はみ出しの
// 浸水域は区と交差せず自然に落ちる）。1枚ずつ開いて閉じる＝開くハンドルを溜めない（land_price と同流儀）。
func aggregateFloodDir(dataDir string) (*floodAccumulator, error) {
	var files []string
	err := filepath.WalkDir(dataDir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(path, ".geojson") {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("タイルの列挙に失敗（%s）: %w", dataDir, err)
	}
	if len(files) == 0 {
		return nil, fmt.Errorf("タイルが無い（%s 配下）。先に scripts/fetch-xkt026.sh で取得する", dataDir)
	}
	sort.Strings(files) // 決定的な処理順（ログの再現性）。

	acc := newFloodAccumulator()
	for _, path := range files {
		if err := addFloodFile(acc, path); err != nil {
			return nil, err
		}
	}
	return acc, nil
}

// addFloodFile は1ファイルを開いて addTile に渡し、必ず閉じる（ハンドルを溜めない）。
func addFloodFile(acc *floodAccumulator, path string) error {
	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("タイルを開けない（%s）: %w", path, err)
	}
	defer f.Close()
	if err := acc.addTile(f); err != nil {
		return fmt.Errorf("タイルの集計に失敗（%s）: %w", path, err)
	}
	return nil
}

// writeFloodCoverage は浸水ポリゴンを一時テーブルへ載せ、交差面積按分で該当面積率を算出し metric_value へ
// 冪等投入する（設計 note §3 の集計 SQL をそのまま用いる）。
//
// 投入規則：(1) metric 単位 DELETE→INSERT で冪等。(2) 浸水 Polygon を TEMP flood_poly(6668) へ COPY し
// GiST 索引を張る。(3) admin_unit(対象1都3県・municipality)を母集合に LEFT JOIN LATERAL で区ごとに
// ST_Union(ST_Intersection(...))::geography の面積÷区面積×100＝率を出し、交差ゼロは COALESCE(...,0)で
// value=0・status='present'（R2）。永続テーブルは作らない（塗り絵は別スライス・範囲外）。
func writeFloodCoverage(ctx context.Context, tx pgx.Tx, acc *floodAccumulator, year int) (FloodResult, error) {
	// 冪等：当該 metric の既存行を消してから入れ直す。
	if _, err := tx.Exec(ctx, `DELETE FROM metric_value WHERE metric = $1`, floodMetricKey); err != nil {
		return FloodResult{}, fmt.Errorf("既存 metric_value(metric=%s) の削除に失敗: %w", floodMetricKey, err)
	}

	// 浸水ポリゴンの一時テーブル（geometry, SRID 6668）。TX 内 ON COMMIT DROP＝コミットで自動破棄（後始末不要）。
	// 永続 flood_polygon は作らない（塗り絵＝生レイヤーは別スライス・本スライスは集計のみ）。
	if _, err := tx.Exec(ctx, `
CREATE TEMP TABLE flood_poly (
    geom geometry(Polygon, 6668) NOT NULL
) ON COMMIT DROP`); err != nil {
		return FloodResult{}, fmt.Errorf("一時テーブル flood_poly の作成に失敗: %w", err)
	}

	// COPY は式を通さないため、geometry を GeoJSON 文字列で raw テーブルへ入れてから ST_GeomFromGeoJSON で
	// geom を組む2段にする（land_price の lon/lat→ST_MakePoint と同じ考え方）。GeoJSON に crs 指定は無いため
	// ST_SetSRID で 6668 を明示付与する（XKT026 CRS=6668・R4：座標系を揃えてから交差・面積を測る）。
	if _, err := tx.Exec(ctx, `
CREATE TEMP TABLE flood_raw (
    gj text NOT NULL
) ON COMMIT DROP`); err != nil {
		return FloodResult{}, fmt.Errorf("一時テーブル flood_raw の作成に失敗: %w", err)
	}
	rows := make([][]any, 0, len(acc.polygons))
	for _, p := range acc.polygons {
		rows = append(rows, []any{p.geoJSON})
	}
	if _, err := tx.CopyFrom(ctx,
		pgx.Identifier{"flood_raw"},
		[]string{"gj"},
		pgx.CopyFromRows(rows),
	); err != nil {
		return FloodResult{}, fmt.Errorf("浸水ポリゴンの COPY 投入に失敗: %w", err)
	}
	// GeoJSON→geom（SRID 6668 明示付与）。ST_MakeValid で自己交差など不正リングを整える（交差・面積計算が
	// 不正ジオメトリで落ちるのを防ぐ＝XKT026 は分割・複雑ポリゴンあり・IF §1 注記）。
	tag, err := tx.Exec(ctx, `
INSERT INTO flood_poly (geom)
SELECT ST_SetSRID(ST_MakeValid(ST_GeomFromGeoJSON(gj)), 6668)
FROM flood_raw`)
	if err != nil {
		return FloodResult{}, fmt.Errorf("浸水ポリゴン geom の組み立てに失敗: %w", err)
	}
	parsed := int(tag.RowsAffected())

	// 交差計算を絞る GiST 空間索引（区に関わる浸水域だけを ST_Intersects で拾わせる・R1 の性能）。
	if _, err := tx.Exec(ctx, `CREATE INDEX ON flood_poly USING gist (geom)`); err != nil {
		return FloodResult{}, fmt.Errorf("flood_poly の GiST 索引作成に失敗: %w", err)
	}
	if _, err := tx.Exec(ctx, `ANALYZE flood_poly`); err != nil {
		return FloodResult{}, fmt.Errorf("flood_poly の ANALYZE に失敗: %w", err)
	}

	// 集計 SQL（設計 note §3 のとおり・land_price の LATERAL パターンを踏襲・R1/R2 の要）。
	//   R1：ST_Union(ST_Intersection(...)) で区と各浸水域の交差を結合し1枚に溶かしてから ::geography で面積
	//       を測る＝タイル分割・境界重複を二重計上しない（これが無いと率が過大＝>100 になり得る）。
	//   R2：COALESCE(cov.rate,0) かつ status='present'＝交差ゼロの区は 0%（present）。取得対象エリアは常に
	//       present（land_price の「点なし→none」とは意味が違う＝浸水想定が無い＝事実の0%）。
	//   R6：left(au.code,2)=ANY($4)＝1都3県。
	const insertSQL = `
INSERT INTO metric_value (unit_id, unit_kind, metric, value, status, year, source)
SELECT au.code,
       au.unit_kind,
       $1,
       COALESCE(cov.rate, 0),
       'present',
       $2,
       $3
FROM admin_unit au
LEFT JOIN LATERAL (
    SELECT ST_Area( ST_Union( ST_Intersection(f.geom, au.geom) )::geography )
           / NULLIF(ST_Area(au.geom::geography), 0) * 100 AS rate
    FROM flood_poly f
    WHERE ST_Intersects(f.geom, au.geom)
) cov ON true
WHERE au.unit_kind = 'municipality'
  AND left(au.code, 2) = ANY($4)
  AND au.geom IS NOT NULL`

	itag, err := tx.Exec(ctx, insertSQL, floodMetricKey, year, floodSource, floodPrefixes)
	if err != nil {
		return FloodResult{}, fmt.Errorf("metric_value への該当面積率 INSERT に失敗: %w", err)
	}
	inserted := int(itag.RowsAffected())

	res := FloodResult{
		Metric:         floodMetricKey,
		Inserted:       inserted,
		PolygonsParsed: parsed,
	}
	if err := assertFloodCoverage(ctx, tx, &res); err != nil {
		return FloodResult{}, err
	}
	return res, nil
}

// assertFloodCoverage は投入の事後チェック（層1＝データの正しさ）。失敗は具体値付きで返しロールバックさせる。
//
// 検証項目（設計 note §4／assertLandPrice と同型）：
//
//	(1) 投入>0 (2) present>0（全件 none は母集合の絞り・交差の失敗の兆候）
//	(3) 全 unit_id が対象 pref（1都3県）(4) status/value 整合（present=値あり・none=値なし）
//	(5) 全行 0≤value≤100（100超なら ST_Union 結合漏れ＝R1 破綻・負は算出バグ） (6) source 非空。
func assertFloodCoverage(ctx context.Context, tx pgx.Tx, res *FloodResult) error {
	if res.Inserted <= 0 {
		return fmt.Errorf("投入件数が0。admin_unit(1都3県) と取得タイルを確認")
	}

	var present, none int
	if err := tx.QueryRow(ctx, `
SELECT count(*) FILTER (WHERE status='present'),
       count(*) FILTER (WHERE status='none')
FROM metric_value WHERE metric = $1`, floodMetricKey).Scan(&present, &none); err != nil {
		return fmt.Errorf("present/none 集計に失敗: %w", err)
	}
	res.Present, res.None = present, none
	if present <= 0 {
		return fmt.Errorf("present が0件（全て none）。母集合の絞り(1都3県)か交差 SQL を確認")
	}

	// 対象 pref 以外の混入チェック（1都3県のみのはず）。
	var badPref int
	if err := tx.QueryRow(ctx, `
SELECT count(*) FROM metric_value
WHERE metric = $1 AND left(unit_id, 2) <> ALL($2)`, floodMetricKey, floodPrefixes).Scan(&badPref); err != nil {
		return fmt.Errorf("pref チェックの集計に失敗: %w", err)
	}
	if badPref != 0 {
		return fmt.Errorf("対象 pref(1都3県)以外の行が %d 件ある（母集合の絞りを確認）", badPref)
	}

	// status と value の整合（present=値あり / none=値なし）。CHECK もあるが層1を可視化。
	var badStatus int
	if err := tx.QueryRow(ctx, `
SELECT count(*) FROM metric_value
WHERE metric = $1
  AND ( (status='present' AND value IS NULL) OR (status='none' AND value IS NOT NULL) )`,
		floodMetricKey).Scan(&badStatus); err != nil {
		return fmt.Errorf("status/value 整合チェックに失敗: %w", err)
	}
	if badStatus != 0 {
		return fmt.Errorf("status と value が矛盾する行が %d 件ある", badStatus)
	}

	// source が空でないこと（出典＝法的要件・R3）。present 行に空 source が無いか数える。
	var emptySource int
	if err := tx.QueryRow(ctx, `
SELECT count(*) FROM metric_value
WHERE metric = $1 AND (source IS NULL OR source = '')`, floodMetricKey).Scan(&emptySource); err != nil {
		return fmt.Errorf("source チェックの集計に失敗: %w", err)
	}
	if emptySource != 0 {
		return fmt.Errorf("source が空の行が %d 件ある（出典は法的要件・R3）", emptySource)
	}

	// 該当面積率の値域＝0≤率≤100（R1 の要）。100超なら ST_Union 結合漏れ（タイル分割の二重計上）、
	// 負は算出バグ。present の min/max を取り、この窓から外れたら壊れた値を残さずロールバックさせる。
	var minV, maxV float64
	if err := tx.QueryRow(ctx, `
SELECT min(value), max(value) FROM metric_value
WHERE metric = $1 AND status = 'present'`, floodMetricKey).Scan(&minV, &maxV); err != nil {
		return fmt.Errorf("該当面積率の値域集計に失敗: %w", err)
	}
	res.MinRate, res.MaxRate = minV, maxV
	// わずかな数値誤差で 100.0000001 になる余地を許容（geography 面積の丸め）。100.01 を超えたら結合漏れとみなす。
	const rateEps = 0.01
	if minV < 0 || maxV > 100+rateEps {
		return fmt.Errorf("該当面積率が値域外（min=%.4f max=%.4f）。100超は ST_Union 結合漏れ(R1)・負は算出バグ", minV, maxV)
	}

	return nil
}
