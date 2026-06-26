package ingest

import (
	"encoding/json"
	"testing"
)

// 偵察で実データ確認済みの検証値（ADR-0007・タスク偵察）：
//   上野(S12_001g=003505)=505392 ＝ JR東北線 325110 ＋ 日比谷線 180282
//   押上(S12_001g=003526)=559147 ＝ 半蔵門線 174863 ＋ 伊勢崎線 174863 ＋ 押上線 209421
//
// これら =1（実カウント）の線分に加え、=2/3（重複・0扱い）と、タイル跨ぎ分割（同一線分が別タイルに再掲）を
// サンプルに混ぜ、parse→dedup→active→合計の純関数連鎖が検証値を再現することを確かめる（DB 非依存・層1）。

// fc は1タイル分の GeoJSON FeatureCollection（テスト用ビルダ）。
func fc(features ...string) []byte {
	body := `{"type":"FeatureCollection","name":"passengers_by_station","features":[`
	for i, f := range features {
		if i > 0 {
			body += ","
		}
		body += f
	}
	body += `]}`
	return []byte(body)
}

// feat は1線分の Feature を組む。dupCode/passengers は IF の表記ゆれ（"1.0" 等）を混ぜて頑健性も見る。
func feat(group, operator, line, dupCode string, passengers int, lon, lat float64) string {
	props := map[string]any{
		tagGroupCode:  group,
		tagOperator:   operator,
		tagLine:       line,
		tagDupCode:    dupCode, // 文字列（"1.0" 等）で渡してパースの頑健性を見る
		tagPassengers: passengers,
	}
	pj, _ := json.Marshal(props)
	// 2点の LineString（中点＝座標数2の中央 index 1＝2点目）。代表点はテストでは未使用（合計のみ検証）。
	return `{"type":"Feature","geometry":{"type":"LineString","coordinates":[[` +
		ftoa(lon) + `,` + ftoa(lat) + `],[` + ftoa(lon) + `,` + ftoa(lat) + `]]},"properties":` + string(pj) + `}`
}

func ftoa(f float64) string {
	b, _ := json.Marshal(f)
	return string(b)
}

// sumByGroup は active 線分を駅グループコードごとに合計する（テスト検証用の補助＝集計の期待値確認）。
func sumByGroup(segs []stationSegment) map[string]int {
	m := map[string]int{}
	for _, s := range segs {
		m[s.GroupCode] += s.Passengers
	}
	return m
}

func TestStationAggregation_UenoOshiage(t *testing.T) {
	t.Parallel()

	// タイル1：上野の =1 二線分＋ノイズ（=2 重複・別駅の =1）。
	tile1 := fc(
		feat("003505", "東日本旅客鉄道", "東北線", "1.0", 325110, 139.777, 35.713),
		feat("003505", "東京地下鉄", "日比谷線", "1", 180282, 139.777, 35.711),
		// =2（重複）は乗降客数が入っていても除外される。
		feat("003505", "東日本旅客鉄道", "山手線", "2.0", 325110, 139.777, 35.713),
	)
	// タイル2：押上の =1 三線分＋上野東北線の「タイル跨ぎ分割」（同一線分の再掲＝1本に畳まれる）。
	tile2 := fc(
		feat("003526", "東京地下鉄", "半蔵門線", "1.0", 174863, 139.813, 35.710),
		feat("003526", "東武鉄道", "伊勢崎線", "1.0", 174863, 139.813, 35.710),
		feat("003526", "京成電鉄", "押上線", "1", 209421, 139.813, 35.710),
		// 上野・東北線がタイル境界で分割され隣タイルにも現れた（同一属性＝dedup で1本に）。
		feat("003505", "東日本旅客鉄道", "東北線", "1.0", 325110, 139.778, 35.714),
		// =3（重複）ノイズ。
		feat("003526", "東武鉄道", "伊勢崎線", "3", 174863, 139.813, 35.710),
	)

	var all []stationSegment
	for _, raw := range [][]byte{tile1, tile2} {
		segs, err := parseTileFeatures(raw)
		if err != nil {
			t.Fatalf("parseTileFeatures: %v", err)
		}
		all = append(all, segs...)
	}

	active := activeSegments(dedupSegments(all))
	got := sumByGroup(active)

	if want := 505392; got["003505"] != want {
		t.Errorf("上野(003505) 合計 = %d, want %d（JR東北線325110＋日比谷180282・タイル跨ぎ重複は1本）", got["003505"], want)
	}
	if want := 559147; got["003526"] != want {
		t.Errorf("押上(003526) 合計 = %d, want %d（半蔵門174863＋伊勢崎174863＋押上線209421・=3重複は除外）", got["003526"], want)
	}
}

func TestActiveSegments_DropsDuplicateCodes(t *testing.T) {
	t.Parallel()
	segs := []stationSegment{
		{GroupCode: "A", Line: "L1", DupCode: 1, Passengers: 100},
		{GroupCode: "A", Line: "L2", DupCode: 2, Passengers: 999}, // 重複＝除外
		{GroupCode: "A", Line: "L3", DupCode: 3, Passengers: 999}, // 重複＝除外
	}
	got := activeSegments(segs)
	if len(got) != 1 || got[0].Passengers != 100 {
		t.Errorf("activeSegments は =1 のみ残すべき: got %+v", got)
	}
}

func TestDedupSegments_TileCrossingMergedDistinctLinesKept(t *testing.T) {
	t.Parallel()
	segs := []stationSegment{
		// 同一線分がタイル跨ぎで2回（代表点だけ違う）→ 1本へ。
		{GroupCode: "A", Operator: "Op", Line: "L1", DupCode: 1, Passengers: 100, RepLon: 139.0, RepLat: 35.0},
		{GroupCode: "A", Operator: "Op", Line: "L1", DupCode: 1, Passengers: 100, RepLon: 139.1, RepLat: 35.1},
		// 同一駅の別オペレータ／別路線は実カウントが別＝残す（合算対象）。
		{GroupCode: "A", Operator: "Op2", Line: "L2", DupCode: 1, Passengers: 50, RepLon: 139.0, RepLat: 35.0},
	}
	got := dedupSegments(segs)
	if len(got) != 2 {
		t.Fatalf("dedup 後の本数 = %d, want 2（同一線分は1本・別路線は残す）", len(got))
	}
	total := 0
	for _, s := range got {
		total += s.Passengers
	}
	if total != 150 {
		t.Errorf("dedup 後合計 = %d, want 150（100＋50・タイル跨ぎ重複の100は1回だけ）", total)
	}
}

func TestParseTileFeatures_IgnoresNonLineStringAndEmpty(t *testing.T) {
	t.Parallel()
	raw := fc(
		`{"type":"Feature","geometry":{"type":"Point","coordinates":[139.0,35.0]},"properties":{"S12_054":"1","S12_057":100}}`,
		`{"type":"Feature","geometry":{"type":"LineString","coordinates":[]},"properties":{"S12_054":"1","S12_057":100}}`,
		feat("A", "Op", "L1", "1", 200, 139.0, 35.0),
	)
	got, err := parseTileFeatures(raw)
	if err != nil {
		t.Fatalf("parseTileFeatures: %v", err)
	}
	if len(got) != 1 || got[0].Passengers != 200 {
		t.Errorf("LineString かつ座標ありの1件だけ取るべき: got %+v", got)
	}
}

func TestCodeToInt_TolerantOfDecimalStrings(t *testing.T) {
	t.Parallel()
	cases := []struct {
		raw  string
		want int
	}{
		{`"1.0"`, 1},
		{`"1"`, 1},
		{`1`, 1},
		{`1.0`, 1},
		{`"2.0"`, 2},
		{`""`, 0},
		{`null`, 0},
	}
	for _, c := range cases {
		if got := codeToInt(json.RawMessage(c.raw)); got != c.want {
			t.Errorf("codeToInt(%s) = %d, want %d", c.raw, got, c.want)
		}
	}
}

func TestJsonInt_TolerantOfStringNumbers(t *testing.T) {
	t.Parallel()
	cases := []struct {
		raw  string
		want int
	}{
		{`40962`, 40962},
		{`"40962"`, 40962},
		{`"40962.0"`, 40962},
		{`null`, 0},
	}
	for _, c := range cases {
		if got := jsonInt(json.RawMessage(c.raw)); got != c.want {
			t.Errorf("jsonInt(%s) = %d, want %d", c.raw, got, c.want)
		}
	}
}

func TestMidpoint_PicksCentralVertex(t *testing.T) {
	t.Parallel()
	// 3点 → 中央 index 1。代表点が端点でなく中ほどの実在頂点であること。
	lon, lat := midpoint([][]float64{{139.0, 35.0}, {139.5, 35.5}, {140.0, 36.0}})
	if lon != 139.5 || lat != 35.5 {
		t.Errorf("midpoint = (%g,%g), want (139.5,35.5)", lon, lat)
	}
}
