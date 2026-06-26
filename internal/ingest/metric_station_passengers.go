package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/jackc/pgx/v5"
)

// stationPassengersMetricKey は駅の合計乗降客数（2023）の metric キー。値API（?metric=...）と一致させる。
const stationPassengersMetricKey = "station_passengers_2023"

// stationPassengersSource は出典（ADR-0011 (c) 法的要件）。
//
// 取得元の API（XKT015）と、市区町村合計という派生の性質を残す＝由来をたどれるようにする。
const stationPassengersSource = "国土数値情報 駅別乗降客数(XKT015) 2023年・市区町村合計"

// 2023年の年次ブロックのタグ（XKT015 IF 定義・偵察で実データ確認済み）。
//   - S12_054＝重複コード：=1 が実カウント、=2/3 は重複（同一区間の別表現）で乗降客数0扱い。
//   - S12_055＝データ有無コード（本集計では参照しない＝S12_054 と S12_057 で十分）。
//   - S12_057＝乗降客数（整数。重複コード=1 の線分のみ合計対象）。
//
// なぜ S12_054=1 のみか：各駅(S12_001g)は複数線分を持ち、=1 が実カウント、=2/3 は重複ゆえ0。
// 直通運転で同値が複数線に乗るが、=1 の各線分は別オペレータの実カウントゆえ合算してよい
// （=2/3 の0重複だけ除外する）。検証値：上野=505392・押上=559147（ADR-0007・偵察）。
const (
	tagDupCode    = "S12_054"
	tagPassengers = "S12_057"
	dupCodeActive = 1 // 実カウントの重複コード値（"1" / "1.0" の双方を 1 に正規化して比較）
)

// stationSegment はタイルから取り出した「駅の線分1本」（集計の最小単位）。
//
// 乗降客数は線分の属性（geometry ではなく properties）ゆえ、同一線分が隣接タイルに分割されても
// 値は同じ。タイル跨ぎの重複は安定キー（dedupKey）で1本に畳む。
type stationSegment struct {
	GroupCode  string  // S12_001g（駅グループコード・同一駅の集約キー）
	Operator   string  // S12_002_ja（運営会社）
	Line       string  // S12_003_ja（路線名）
	DupCode    int     // S12_054（=1 が実カウント）
	Passengers int     // S12_057（乗降客数）
	RepLon     float64 // 代表点の経度（LineString 中点）
	RepLat     float64 // 代表点の緯度
}

// dedupKey はタイル跨ぎ重複排除の安定キー。
//
// 同一線分（同じ駅・運営会社・路線・重複コード）が隣接タイルへ分割されても、属性は同一ゆえ同じキーになる。
// 別オペレータ／別路線の =1 線分は実カウントが別なので別キー＝合算対象（上野=2線分・押上=3線分を再現）。
// 重複コードもキーに含める：稀に同一線分の =1 と =2 が別 feature で来ても取り違えないため。
func (s stationSegment) dedupKey() string {
	return s.GroupCode + "\x1f" + s.Operator + "\x1f" + s.Line + "\x1f" + fmt.Sprint(s.DupCode)
}

// xkt015FeatureCollection は XKT015 タイル応答（GeoJSON）の必要部分だけを写す。
//
// properties は型が混在する（駅名は文字列・乗降客数は整数・コードは "1.0" 等の文字列）ため
// json.RawMessage で受け、フィールドごとに型を見て正規化する（憶測でひとつの型に決め打ちしない）。
type xkt015FeatureCollection struct {
	Features []struct {
		Geometry struct {
			Type        string          `json:"type"`
			Coordinates json.RawMessage `json:"coordinates"`
		} `json:"geometry"`
		Properties map[string]json.RawMessage `json:"properties"`
	} `json:"features"`
}

// parseTileFeatures は1タイルの GeoJSON から駅線分を取り出す（DB 非依存・純関数＝層1単体テスト対象）。
//
// LineString 以外（点・面）は無視する（XKT015 は LineString だが防御的に）。代表点は LineString の
// 中点（座標列の中央インデックス）で近似する＝市区町村への内包判定（ST_Within）に使う1点。
// 端点ではなく中点を選ぶ理由：駅区間の所在市区町村を端の越境で取り違えにくい（区間の中ほどが駅本体に近い）。
func parseTileFeatures(raw []byte) ([]stationSegment, error) {
	var fc xkt015FeatureCollection
	if err := json.Unmarshal(raw, &fc); err != nil {
		return nil, fmt.Errorf("タイル GeoJSON の解析に失敗: %w", err)
	}

	out := make([]stationSegment, 0, len(fc.Features))
	for _, f := range fc.Features {
		if f.Geometry.Type != "LineString" {
			continue
		}
		var coords [][]float64
		if err := json.Unmarshal(f.Geometry.Coordinates, &coords); err != nil {
			return nil, fmt.Errorf("LineString 座標の解析に失敗: %w", err)
		}
		if len(coords) == 0 {
			continue
		}

		seg := stationSegment{
			GroupCode:  jsonString(f.Properties[tagGroupCode]),
			Operator:   jsonString(f.Properties[tagOperator]),
			Line:       jsonString(f.Properties[tagLine]),
			DupCode:    codeToInt(f.Properties[tagDupCode]),
			Passengers: jsonInt(f.Properties[tagPassengers]),
		}
		lon, lat := midpoint(coords)
		seg.RepLon = lon
		seg.RepLat = lat
		out = append(out, seg)
	}
	return out, nil
}

// 駅の識別属性タグ（XKT015 IF）。
const (
	tagGroupCode = "S12_001g"
	tagOperator  = "S12_002_ja"
	tagLine      = "S12_003_ja"
)

// midpoint は LineString 座標列の中点（座標数の中央インデックス）を返す。
//
// 厳密な弧長中点ではなく頂点列の中央＝代表点の近似で十分（市区町村の内包判定の一点に使うだけ）。
// 偶数個でも中央寄りの1頂点を取る（補間しない＝実在頂点を使い数値誤差を持ち込まない）。
func midpoint(coords [][]float64) (lon, lat float64) {
	c := coords[len(coords)/2]
	return c[0], c[1]
}

// dedupSegments はタイル跨ぎの重複線分を安定キーで1本に畳む（DB 非依存・純関数＝層1単体テスト対象）。
//
// 同一線分が隣接タイルに分割されても属性は同一ゆえ同キー＝1本に。出現順に依らず決定的にするため
// キー順にソートして返す（テスト・ログの再現性）。代表点は最初に出会った1本のものを採る
// （断片ごとに中点はずれるが、所在市区町村の判定には十分＝同一線分はおおむね同一市区町村内）。
func dedupSegments(segs []stationSegment) []stationSegment {
	seen := make(map[string]stationSegment, len(segs))
	for _, s := range segs {
		if _, ok := seen[s.dedupKey()]; !ok {
			seen[s.dedupKey()] = s
		}
	}
	keys := make([]string, 0, len(seen))
	for k := range seen {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make([]stationSegment, 0, len(seen))
	for _, k := range keys {
		out = append(out, seen[k])
	}
	return out
}

// activeSegments は重複コード=1（実カウント）の線分だけを残す（=2/3 の0重複を除外）。
//
// DB 非依存の純関数（層1単体テスト対象）。乗降客数が0以下の =1 線分も残す（=1 は実カウントの宣言ゆえ
// 値が0でも「該当する線分」として扱い、市区町村合計に0を足す＝集計の取りこぼしを作らない）。
func activeSegments(segs []stationSegment) []stationSegment {
	out := make([]stationSegment, 0, len(segs))
	for _, s := range segs {
		if s.DupCode == dupCodeActive {
			out = append(out, s)
		}
	}
	return out
}

// loadStationSegments は保存タイル群を読み、解析→タイル跨ぎ重複排除→重複コード=1 抽出まで行う。
//
// 取得（fetch-xkt015.sh）が data/xkt015/{year}/{pref}/z11_*.geojson を置いた前提。
// この段までが DB 非依存（純関数の連鎖）＝固定サンプルで上野=505392・押上=559147 を再現できる。
func loadStationSegments(dir string) ([]stationSegment, error) {
	paths, err := filepath.Glob(filepath.Join(dir, "z11_*.geojson"))
	if err != nil {
		return nil, fmt.Errorf("タイル一覧の取得に失敗（%s）: %w", dir, err)
	}
	if len(paths) == 0 {
		return nil, fmt.Errorf("タイルが無い（%s/z11_*.geojson）。先に scripts/fetch-xkt015.sh", dir)
	}

	var all []stationSegment
	for _, p := range paths {
		raw, err := os.ReadFile(p) //nolint:gosec // パスは glob で得た data 配下のみ（外部入力ではない）
		if err != nil {
			return nil, fmt.Errorf("タイル読み込みに失敗（%s）: %w", p, err)
		}
		segs, err := parseTileFeatures(raw)
		if err != nil {
			return nil, fmt.Errorf("タイル解析に失敗（%s）: %w", p, err)
		}
		all = append(all, segs...)
	}

	return activeSegments(dedupSegments(all)), nil
}

// ComputeStationPassengers2023 は XKT015 タイルから市区町村ごとの合計乗降客数(2023)を metric_value へ書く（冪等）。
//
// 設計（ADR-0007 交通＝色分けは合計乗降客数2023・ADR-0015 縦持ち＋点/線→内包・ADR-0011 該当なし=0）：
//  1. タイル解析→タイル跨ぎ重複排除→重複コード=1 抽出（Go 純関数・上で実施）。
//  2. 各線分の代表点（中点）が内包される admin_unit へ ST_Contains で割り付け、S12_057 を合計（SQL）。
//  3. 駅の無い市区町村は該当なし＝0（value=0・status=present＝ADR-0011）で全 admin_unit に1行ずつ。
//
// 冪等：metric 単位で DELETE→INSERT。dir は data/xkt015/{year}/{pref}（取得スクリプトの配置規約）。
func ComputeStationPassengers2023(ctx context.Context, dsn, dir string) (MetricResult, error) {
	segs, err := loadStationSegments(dir)
	if err != nil {
		return MetricResult{}, err
	}
	if len(segs) == 0 {
		return MetricResult{}, fmt.Errorf("重複コード=1 の駅線分が0件（%s）。取得タイルの中身を確認", dir)
	}

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		// dsn にはパスワードが含まれるため、エラーに dsn を載せない。
		return MetricResult{}, fmt.Errorf("DB へ接続できない（POSTGRES_* と DB 起動を確認）: %w", err)
	}
	defer conn.Close(ctx)

	tx, err := conn.Begin(ctx)
	if err != nil {
		return MetricResult{}, fmt.Errorf("トランザクション開始に失敗: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // commit 済みなら no-op

	// 線分（代表点・乗降客数）を一時テーブルへ流し込み、SQL 側で空間結合・合計する。
	// なぜ一時テーブルか：代表点の内包判定（ST_Contains）と市区町村合計は集合演算ゆえ SQL が得意で、
	// Go 側で admin_unit 全件を引いて点ごとに判定するより索引（GIST）が効き速い・読みやすい。
	// ON COMMIT DROP でトランザクション終了時に自動破棄（後始末を忘れない）。
	if _, err := tx.Exec(ctx, `
CREATE TEMP TABLE station_seg (
    rep_lon    double precision NOT NULL,
    rep_lat    double precision NOT NULL,
    passengers integer          NOT NULL
) ON COMMIT DROP`); err != nil {
		return MetricResult{}, fmt.Errorf("一時テーブル作成に失敗: %w", err)
	}

	// 大量ではない（首都圏の駅線分は数千）が、行投入は CopyFrom が素直（backend-conventions §1.1 例外2）。
	rows := make([][]any, 0, len(segs))
	for _, s := range segs {
		rows = append(rows, []any{s.RepLon, s.RepLat, s.Passengers})
	}
	if _, err := tx.CopyFrom(ctx,
		pgx.Identifier{"station_seg"},
		[]string{"rep_lon", "rep_lat", "passengers"},
		pgx.CopyFromRows(rows),
	); err != nil {
		return MetricResult{}, fmt.Errorf("線分の一時テーブル投入に失敗: %w", err)
	}

	// 指標単位の入れ替え（DELETE→INSERT）。$1=metric。値は必ず引数化（§1.3）。
	if _, err := tx.Exec(ctx, `DELETE FROM metric_value WHERE metric = $1`, stationPassengersMetricKey); err != nil {
		return MetricResult{}, fmt.Errorf("既存 metric_value(metric=%s) の削除に失敗: %w", stationPassengersMetricKey, err)
	}

	// 全 admin_unit を母集合に LEFT JOIN：駅のある市区町村は合計、無い市区町村は0（該当なし＝present・ADR-0011）。
	// 代表点は WGS84/JGD2011 実用同値（ADR-0014）ゆえ 6668 で点を作り admin_unit.geom（6668）と ST_Contains。
	// year=2023（XKT015 の対象年・S12_057）。status は全行 present（駅なし=0 も「未調査」ではなく事実の0）。
	const insertSQL = `
INSERT INTO metric_value (unit_id, unit_kind, metric, value, status, year, source)
SELECT a.code,
       a.unit_kind,
       $1,
       COALESCE(s.total, 0),
       'present',
       2023,
       $2
FROM admin_unit a
LEFT JOIN (
    SELECT a2.code AS code, sum(seg.passengers)::double precision AS total
    FROM station_seg seg
    JOIN admin_unit a2
      ON ST_Contains(a2.geom, ST_SetSRID(ST_MakePoint(seg.rep_lon, seg.rep_lat), 6668))
    GROUP BY a2.code
) s ON s.code = a.code
WHERE a.geom IS NOT NULL`
	tag, err := tx.Exec(ctx, insertSQL, stationPassengersMetricKey, stationPassengersSource)
	if err != nil {
		return MetricResult{}, fmt.Errorf("metric_value への乗降客数 INSERT に失敗（admin_unit 投入済みか確認）: %w", err)
	}
	inserted := int(tag.RowsAffected())

	res, err := assertStationPassengers(ctx, tx, inserted)
	if err != nil {
		// 層1チェック失敗はロールバック（defer）＝壊れた値を残さない。
		return MetricResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return MetricResult{}, fmt.Errorf("コミットに失敗: %w", err)
	}
	return res, nil
}

// assertStationPassengers は乗降客数投入の事後チェック（層1＝データの正しさ）。失敗は具体的な値付きで返す。
//
// 検証項目：(1) 投入件数>0（全 admin_unit に1行＝該当なし0 も present） (2) present なのに value NULL が無い
// (3) 値域：負が無い（乗降客数は非負） (4) 合計>0（全0なら空間結合が成立していない兆候）
// (5) 二重計上の兆候：単一市区町村の値が現実的上限を超えていないか（日本最大級ターミナルでも数百万人/日規模）。
func assertStationPassengers(ctx context.Context, tx pgx.Tx, inserted int) (MetricResult, error) {
	if inserted <= 0 {
		return MetricResult{}, fmt.Errorf("投入件数が0。admin_unit に境界が投入済みか確認（先に make ingest-n03）")
	}

	var minV, maxV, sumV float64
	var nullCount int
	if err := tx.QueryRow(ctx, `
SELECT min(value), max(value), sum(value),
       count(*) FILTER (WHERE value IS NULL)
FROM metric_value
WHERE metric = $1`, stationPassengersMetricKey).Scan(&minV, &maxV, &sumV, &nullCount); err != nil {
		return MetricResult{}, fmt.Errorf("乗降客数の値域集計に失敗: %w", err)
	}
	if nullCount != 0 {
		return MetricResult{}, fmt.Errorf("present なのに value が NULL の行が %d 件ある（集計漏れ）", nullCount)
	}
	if minV < 0 {
		return MetricResult{}, fmt.Errorf("乗降客数に負値がある（min=%g）。S12_057 のパースか符号を確認", minV)
	}
	if sumV <= 0 {
		return MetricResult{}, fmt.Errorf("合計が0以下（sum=%g）。代表点の内包判定（ST_Contains・SRID6668）が成立しているか確認", sumV)
	}
	// 上限の目安：1市区町村の合計が 5000 万人/日（=5e7）を超えるのは二重計上の兆候。
	// 新宿区（都内最大級）でも全駅合算で数百万人/日規模ゆえ、桁が2つ跳ねたら集計を疑う。
	const sanityMaxPerUnit = 50000000
	if maxV > sanityMaxPerUnit {
		return MetricResult{}, fmt.Errorf("1市区町村の合計が現実的上限(%d)を超える（max=%g）。重複コード=1 抽出とタイル跨ぎ重複排除を確認", sanityMaxPerUnit, maxV)
	}

	return MetricResult{
		Metric:   stationPassengersMetricKey,
		Inserted: inserted,
		MinValue: minV,
		MaxValue: maxV,
	}, nil
}
