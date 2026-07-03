package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5"
)

// landPriceMetricKey は公的地価の中央値(住宅地)の metric キー。値API（?metric=...）と一致させる。
const landPriceMetricKey = "land_price_median"

// landPriceSource は本指標の出典（ADR-0011 (c) 法的要件）。公的地価（地価公示＋地価調査）由来を明示し、
// 中央値・住宅地・当年価格という集計条件も残す＝由来と意味をたどれるようにする（黙って数値だけ出さない）。
const landPriceSource = "国土交通省 不動産情報ライブラリ 地価公示・地価調査(XPT002)。住宅地の当年地価(円/㎡)を市区町村ごとに中央値で集計"

// residentialUseCategoryName は住宅地の用途区分名（XPT002 IF：useCategoryCode=00 の名称表記）。
// 集計側の二重防御フィルタに使う（fetch で 00 を渡すが、名称でも絞り混入を防ぐ）。ADR-0008：色分けは住宅地1本。
const residentialUseCategoryName = "住宅地"

// landPricePrefixes は本スライスの対象エリア（1都3県）の pref コード（ADR-0030 波1）。
// admin_unit にこれらの pref がある前提で、none 埋めの母集合と実行後アサートに使う。
var landPricePrefixes = []string{"11", "12", "13", "14"}

// LandPriceResult は地価中央値投入の結果要約（ログ・層1検証用）。
type LandPriceResult struct {
	Metric       string  // 投入指標キー
	Inserted     int     // metric_value へ投入した行数（present+none）
	Present      int     // status=present（中央値が出た）行数
	None         int     // status=none（該当点なし）行数
	PointsParsed int     // タイルから採用した住宅地点の数（重複排除・住宅地フィルタ後）
	DupSkipped   int     // point_id 重複でスキップした点数
	NonResiSkip  int     // 住宅地(00)以外でスキップした点数
	BadPriceSkip int     // 価格パース不能でスキップした点数
	MinYen       float64 // present の最小中央値（層1：桁ずれ/負の検出）
	MaxYen       float64 // present の最大中央値（層1：桁外れの検出）
}

// parseLandPriceYen は XPT002 当年価格の整形文字列を円/㎡ の数値へパースする（純関数・層1の核）。
//
// XPT002 IF §3 の非対称：当年価格 u_current_years_price_ja は "1,210,000(円/㎡)" の整形文字列
// （前年 last_years_price は生整数だが、色分けは ADR-0008 で「当年」を使うため当年をパースする）。
// カンマ（桁区切り）と単位 "(円/㎡)"（全角/半角の括弧・㎡ の表記ゆれに耐える）を除いて整数化する。
// 空文字・数字を含まない・0以下は「価格として使えない」ゆえ ok=false（集計から落とす＝BadPriceSkip）。
func parseLandPriceYen(raw string) (float64, bool) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return 0, false
	}
	// 数字とマイナス以外（カンマ・単位・括弧・空白・全角記号）を全部削り、残った数字列を読む。
	// 単位表記のゆれ（"(円/㎡)"／全角括弧等）に依存せず「数値部分だけ」を取り出す頑健策。
	var b strings.Builder
	for _, r := range s {
		if (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		}
	}
	digits := b.String()
	if digits == "" || digits == "-" {
		return 0, false
	}
	v, err := strconv.ParseFloat(digits, 64)
	if err != nil {
		return 0, false
	}
	if v <= 0 {
		// 地価は正。0/負は欠損表現かパース取り違えゆえ採用しない。
		return 0, false
	}
	return v, true
}

// landPricePoint はタイルから抽出する1地価点（DB 投入・空間結合の中間形）。
type landPricePoint struct {
	PointID string  // 一意キー（重複排除。IF §3：point_id）
	Lon     float64 // 経度（EPSG:6668＝admin_unit と同一 SRID）
	Lat     float64 // 緯度
	Yen     float64 // 当年地価(円/㎡)
}

// landPriceProps は1点から抽出するプロパティ（XPT002 IF のタグ名に紐づく json タグ）。
//
// point_id は整数型ゆえ json.Number で受けて文字列化（重複排除キー）。use_category_name_ja は
// 用途区分名（"住宅地" 等・表記は名称）。当年価格は整形文字列。他の数百項目は Decode が読み捨てる
// （ストリーム抽出＝全属性をメモリに載せない・metric_pop_change と同流儀）。
type landPriceProps struct {
	PointID           json.Number `json:"point_id"`
	UseCategoryNameJa string      `json:"use_category_name_ja"`
	CurrentPriceJa    string      `json:"u_current_years_price_ja"`
}

// landPriceAccumulator はタイルをまたいで地価点を集める蓄積器（重複排除・住宅地フィルタ・パース）。
//
// なぜ全点をメモリに持つか：地価点は疎（1都3県で数千点規模）＝メッシュ(数十万)と桁が違い、全点を
// 保持しても軽い。空間結合（点→市区町村ポリゴン内包・ADR-0015）は PostGIS 側で行うため、ここは
// 「有効な住宅地点の一覧」を作るところまで（座標＋価格）。
type landPriceAccumulator struct {
	seen   map[string]struct{}
	points []landPricePoint
	// 集計の可視化（層1）。
	dupSkipped   int
	nonResiSkip  int
	badPriceSkip int
}

func newLandPriceAccumulator() *landPriceAccumulator {
	return &landPriceAccumulator{seen: make(map[string]struct{})}
}

// addTile は GeoJSON タイル1枚をストリームで読み、住宅地点を蓄積器へ足す（metric_pop_change と同じ走査）。
func (a *landPriceAccumulator) addTile(r io.Reader) error {
	dec := json.NewDecoder(r)
	if err := seekToFeaturesArray(dec); err != nil {
		return err
	}
	for dec.More() {
		var f struct {
			Geometry struct {
				Coordinates []float64 `json:"coordinates"`
			} `json:"geometry"`
			Properties landPriceProps `json:"properties"`
		}
		if err := dec.Decode(&f); err != nil {
			return fmt.Errorf("Feature の復号に失敗: %w", err)
		}
		a.addPoint(f.Geometry.Coordinates, f.Properties)
	}
	return nil
}

// addPoint は1点を重複排除・住宅地フィルタ・価格パースして採用/棄却する（純ロジック・層1の核）。
//
// 住宅地の絞りは use_category_name_ja=="住宅地" で行う（fetch 時に useCategoryCode=00 を渡すが、
// 取得漏れ・混入への二重防御として集計側でも名称で絞る）。座標は [lon,lat] の2要素前提（GeoJSON）。
func (a *landPriceAccumulator) addPoint(coords []float64, p landPriceProps) {
	id := strings.TrimSpace(p.PointID.String())
	if id == "" {
		return // 一意キー欠落は重複排除できず捨てる（防御）。
	}
	if _, dup := a.seen[id]; dup {
		a.dupSkipped++
		return
	}
	a.seen[id] = struct{}{}

	if strings.TrimSpace(p.UseCategoryNameJa) != residentialUseCategoryName {
		a.nonResiSkip++
		return
	}
	yen, ok := parseLandPriceYen(p.CurrentPriceJa)
	if !ok {
		a.badPriceSkip++
		return
	}
	if len(coords) < 2 {
		a.badPriceSkip++ // 座標欠落＝内包判定できず落とす（価格不良と同区分で数える）。
		return
	}
	a.points = append(a.points, landPricePoint{
		PointID: id,
		Lon:     coords[0],
		Lat:     coords[1],
		Yen:     yen,
	})
}

// ComputeLandPriceMedian は data/xpt002/<year> 配下のタイル群を集計し、住宅地の当年地価中央値を
// 市区町村ごとに metric_value へ書き込む（冪等・ADR-0008 中央値1本・ADR-0015 点:内包）。
//
// 設計：
//   - タイル群をストリーム抽出（point_id/use_category_name_ja/当年価格/座標）→ point_id 重複排除 →
//     住宅地(00)フィルタ → 価格パース。
//   - 抽出点を一時テーブルへ載せ、admin_unit ポリゴンへ ST_Within（点:内包・ADR-0015）で結合し、
//     市区町村ごとに percentile_cont(0.5)＝中央値（ADR-0008）を算出。
//   - 対象 pref（1都3県）の admin_unit 全単位を母集合に、点があれば present（中央値）、無ければ
//     none（該当点なし・値なし）で埋める（データなし3区別・ADR-0011）。
//   - 冪等：metric 単位 DELETE→INSERT。実行後アサート（件数・値域＝地価が常識的な円/㎡）で層1を守る。
//
// dataDir は data/xpt002/<year> のような「pref サブディレクトリ配下にタイルが並ぶ」ルート
// （data/xpt002/2024/13/z13_x_y.geojson 等）を再帰探索する。鍵・取得は要らず（ファイルは
// fetch-xpt002.sh が用意済み）DB 接続のみ＝層1検証を取得の不確実性から切り離す。
func ComputeLandPriceMedian(ctx context.Context, dsn, dataDir string, year int) (LandPriceResult, error) {
	if year < 1995 || year > 2100 {
		// XPT002 IF：year は 1995〜最新。取り違え（0・桁違い）を早期に弾く。
		return LandPriceResult{}, fmt.Errorf("year が不正（%d）。XPT002 の対象年（例 2024）を指定する", year)
	}
	acc, err := aggregateLandPriceDir(dataDir)
	if err != nil {
		return LandPriceResult{}, err
	}

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		// dsn にはパスワードが含まれるため、エラーに dsn を載せない。
		return LandPriceResult{}, fmt.Errorf("DB へ接続できない（POSTGRES_* と DB 起動を確認）: %w", err)
	}
	defer conn.Close(ctx)

	tx, err := conn.Begin(ctx)
	if err != nil {
		return LandPriceResult{}, fmt.Errorf("トランザクション開始に失敗: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // commit 済みなら no-op

	res, err := writeLandPrice(ctx, tx, acc, year)
	if err != nil {
		return LandPriceResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return LandPriceResult{}, fmt.Errorf("コミットに失敗: %w", err)
	}
	return res, nil
}

// aggregateLandPriceDir は dataDir 配下（サブディレクトリ含む）の *.geojson を1枚ずつストリーム集計する。
//
// 配置規約 data/xpt002/<year>/<pref>/z13_x_y.geojson ゆえ再帰的に集める（pref をまたいで全点を1蓄積器へ）。
// 空間結合で pref を判定するため、ここでは pref を区別せず全点を載せる（県外はみ出し点は admin_unit に
// 内包されず自然に落ちる）。
func aggregateLandPriceDir(dataDir string) (*landPriceAccumulator, error) {
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
		return nil, fmt.Errorf("タイルが無い（%s 配下）。先に scripts/fetch-xpt002.sh で取得する", dataDir)
	}
	sort.Strings(files) // 決定的な処理順（ログの再現性）。

	acc := newLandPriceAccumulator()
	for _, path := range files {
		if err := addLandPriceFile(acc, path); err != nil {
			return nil, err
		}
	}
	return acc, nil
}

// addLandPriceFile は1ファイルを開いて addTile に渡し、必ず閉じる（ハンドルを溜めない）。
func addLandPriceFile(acc *landPriceAccumulator, path string) error {
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

// writeLandPrice は抽出点を一時テーブルへ載せ、空間結合で中央値を算出し metric_value へ冪等投入する。
//
// 投入規則：(1) metric 単位 DELETE→INSERT で冪等。(2) 抽出点を temp テーブル land_price_pt へ COPY し、
// admin_unit へ ST_Within で内包結合（ADR-0015 点:内包）→ 市区町村ごと percentile_cont(0.5)（ADR-0008
// 中央値）。(3) 対象 pref（1都3県）の admin_unit 全単位を母集合に、中央値があれば present、無ければ
// none で埋める（データなし3区別・ADR-0011）。FK ゆえ admin_unit に無いコードは自然に落ちる（ADR-0014）。
func writeLandPrice(ctx context.Context, tx pgx.Tx, acc *landPriceAccumulator, year int) (LandPriceResult, error) {
	// 冪等：当該 metric の既存行を消してから入れ直す。
	if _, err := tx.Exec(ctx, `DELETE FROM metric_value WHERE metric = $1`, landPriceMetricKey); err != nil {
		return LandPriceResult{}, fmt.Errorf("既存 metric_value(metric=%s) の削除に失敗: %w", landPriceMetricKey, err)
	}

	// 抽出点を一時テーブルへ。TX 内 ON COMMIT DROP＝コミットで自動破棄（後始末不要）。
	// 座標は EPSG:6668（admin_unit と同一）で Point を組む＝変換不要（XPT002 CRS=6668）。
	if _, err := tx.Exec(ctx, `
CREATE TEMP TABLE land_price_pt (
    point_id text NOT NULL,
    yen      double precision NOT NULL,
    geom     geometry(Point, 6668) NOT NULL
) ON COMMIT DROP`); err != nil {
		return LandPriceResult{}, fmt.Errorf("一時テーブルの作成に失敗: %w", err)
	}

	// 点を COPY で一括投入（ADR-0017 例外2：大量投入は CopyFrom）。geom は WKT を ST_SetSRID/ST_MakePoint
	// で作りたいが CopyFrom は式を通さないため、lon/lat/yen を素で入れて後で geom を埋める2段にする。
	if _, err := tx.Exec(ctx, `
CREATE TEMP TABLE land_price_raw (
    point_id text NOT NULL,
    lon      double precision NOT NULL,
    lat      double precision NOT NULL,
    yen      double precision NOT NULL
) ON COMMIT DROP`); err != nil {
		return LandPriceResult{}, fmt.Errorf("一時テーブル(raw)の作成に失敗: %w", err)
	}
	rows := make([][]any, 0, len(acc.points))
	for _, p := range acc.points {
		rows = append(rows, []any{p.PointID, p.Lon, p.Lat, p.Yen})
	}
	if _, err := tx.CopyFrom(ctx,
		pgx.Identifier{"land_price_raw"},
		[]string{"point_id", "lon", "lat", "yen"},
		pgx.CopyFromRows(rows),
	); err != nil {
		return LandPriceResult{}, fmt.Errorf("地価点の COPY 投入に失敗: %w", err)
	}
	// geom を SRID 6668 の Point で組む（ST_MakePoint(lon,lat)＝経度が先）。
	if _, err := tx.Exec(ctx, `
INSERT INTO land_price_pt (point_id, yen, geom)
SELECT point_id, yen, ST_SetSRID(ST_MakePoint(lon, lat), 6668)
FROM land_price_raw`); err != nil {
		return LandPriceResult{}, fmt.Errorf("地価点 geom の組み立てに失敗: %w", err)
	}

	// 空間結合で市区町村ごとの中央値を算出（ADR-0015 点:内包・ADR-0008 中央値）。
	// 対象 pref（1都3県）の admin_unit を母集合に LEFT JOIN で内包点を集め、中央値があれば present、
	// 無ければ none で埋める（データなし3区別・ADR-0011）。source/year もここで確定させる。
	// year は本スライスの取得対象年（当年＝最新）を持たせる（面積の year NULL と違い地価は年次の意味を持つ）。
	const insertSQL = `
INSERT INTO metric_value (unit_id, unit_kind, metric, value, status, year, source)
SELECT au.code,
       au.unit_kind,
       $1,
       med.median,
       CASE WHEN med.median IS NOT NULL THEN 'present' ELSE 'none' END,
       $2,
       $3
FROM admin_unit au
LEFT JOIN LATERAL (
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY p.yen) AS median
    FROM land_price_pt p
    WHERE ST_Within(p.geom, au.geom)
) med ON true
WHERE au.unit_kind = 'municipality'
  AND left(au.code, 2) = ANY($4)
  AND au.geom IS NOT NULL`

	tag, err := tx.Exec(ctx, insertSQL, landPriceMetricKey, year, landPriceSource, landPricePrefixes)
	if err != nil {
		return LandPriceResult{}, fmt.Errorf("metric_value への中央値 INSERT に失敗: %w", err)
	}
	inserted := int(tag.RowsAffected())

	res := LandPriceResult{
		Metric:       landPriceMetricKey,
		Inserted:     inserted,
		PointsParsed: len(acc.points),
		DupSkipped:   acc.dupSkipped,
		NonResiSkip:  acc.nonResiSkip,
		BadPriceSkip: acc.badPriceSkip,
	}
	if err := assertLandPrice(ctx, tx, &res); err != nil {
		return LandPriceResult{}, err
	}
	return res, nil
}

// assertLandPrice は投入の事後チェック（層1＝データの正しさ）。失敗は具体値付きで返しロールバックさせる。
//
// 検証項目：(1) 投入>0 (2) present>0（全件 none は空間結合か住宅地フィルタの失敗の兆候）
// (3) 全 unit_id が対象 pref（1都3県）(4) status/value 整合（present=値あり・none=値なし）
// (5) present の中央値が現実的な地価範囲（1万〜1000万円/㎡＝負/0/桁ずれを弾く）。
func assertLandPrice(ctx context.Context, tx pgx.Tx, res *LandPriceResult) error {
	if res.Inserted <= 0 {
		return fmt.Errorf("投入件数が0。admin_unit(1都3県) と取得タイルを確認")
	}

	var present, none int
	if err := tx.QueryRow(ctx, `
SELECT count(*) FILTER (WHERE status='present'),
       count(*) FILTER (WHERE status='none')
FROM metric_value WHERE metric = $1`, landPriceMetricKey).Scan(&present, &none); err != nil {
		return fmt.Errorf("present/none 集計に失敗: %w", err)
	}
	res.Present, res.None = present, none
	if present <= 0 {
		return fmt.Errorf("present が0件（全て none）。ST_Within 空間結合か住宅地フィルタ・価格パースを確認")
	}

	// 対象 pref 以外の混入チェック（1都3県のみのはず）。
	var badPref int
	if err := tx.QueryRow(ctx, `
SELECT count(*) FROM metric_value
WHERE metric = $1 AND left(unit_id, 2) <> ALL($2)`, landPriceMetricKey, landPricePrefixes).Scan(&badPref); err != nil {
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
		landPriceMetricKey).Scan(&badStatus); err != nil {
		return fmt.Errorf("status/value 整合チェックに失敗: %w", err)
	}
	if badStatus != 0 {
		return fmt.Errorf("status と value が矛盾する行が %d 件ある", badStatus)
	}

	// present の中央値の値域。地価(円/㎡)の常識的範囲：1万円未満/1000万円超は桁ずれ・パース取り違えの兆候。
	var minV, maxV float64
	if err := tx.QueryRow(ctx, `
SELECT min(value), max(value) FROM metric_value
WHERE metric = $1 AND status = 'present'`, landPriceMetricKey).Scan(&minV, &maxV); err != nil {
		return fmt.Errorf("中央値の値域集計に失敗: %w", err)
	}
	res.MinYen, res.MaxYen = minV, maxV
	// 地価(円/㎡)の常識的範囲：都心区は数百万円台（港区で 556万/㎡ の点）、郊外・山間の町村は数千円台
	// （大多喜町で 2,810 円/㎡ の点＝実データで確認）。よって下限は 1,000 円/㎡（これ未満は桁ずれ/欠損
	// 混入の兆候）・上限は 1,000万 円/㎡（これ超は円と別単位の取り違え兆候）。中央値ゆえ点の最安/最高より
	// 内側に来る想定だが、母数の少ない町村は単点近い値になり得るため点の値域に合わせて緩める。
	const sanityMinYen, sanityMaxYen = 1000.0, 10000000.0
	if minV < sanityMinYen || maxV > sanityMaxYen {
		return fmt.Errorf("地価中央値が現実的範囲(%.0f〜%.0f円/㎡)外（min=%.0f max=%.0f）。価格パース・単位を確認",
			sanityMinYen, sanityMaxYen, minV, maxV)
	}

	return nil
}
