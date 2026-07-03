package ingest

import (
	"strings"
	"testing"
)

// TestParseLandPriceYen は XPT002 当年価格の整形文字列パース（カンマ・単位除去）と、
// 空/不正/0以下の棄却を確かめる（層1の核＝価格パース）。
func TestParseLandPriceYen(t *testing.T) {
	t.Parallel()
	cases := []struct {
		in     string
		want   float64
		wantOk bool
	}{
		{"1,210,000(円/㎡)", 1210000, true}, // recon で得た実データ形（半角括弧）
		{"3,100,000(円/㎡)", 3100000, true}, // IF §3 の例
		{"310000", 310000, true},          // 単位・カンマ無し（生値でも読める）
		{" 55,000 (円/㎡) ", 55000, true},   // 前後空白・単位前空白
		{"", 0, false},                    // 空文字＝欠損
		{"(円/㎡)", 0, false},               // 数字なし
		{"0(円/㎡)", 0, false},              // 0以下は棄却（欠損表現/取り違え）
		{"-100", 0, false},                // 負は棄却
	}
	for _, c := range cases {
		got, ok := parseLandPriceYen(c.in)
		if ok != c.wantOk {
			t.Errorf("parseLandPriceYen(%q) ok=%v want %v", c.in, ok, c.wantOk)
			continue
		}
		if ok && got != c.want {
			t.Errorf("parseLandPriceYen(%q)=%v want %v", c.in, got, c.want)
		}
	}
}

// landTile は最小の XPT002 風 FeatureCollection を組む（features は crs/name の後に置き、
// seekToFeaturesArray が並び順に依らず降りられることも兼ねて確かめる）。
func landTile(feats ...string) string {
	return `{
  "type": "FeatureCollection",
  "name": "land_prices",
  "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::6668" } },
  "features": [` + strings.Join(feats, ",") + `]
}`
}

// landFeat は1地価点 Feature を組む。properties に IF の余分なキー（last_years_price 等）を混ぜ、
// 抽出が必要キーに絞れることも確かめる。geometry は Point。
func landFeat(pointID, useCat, priceJa string, lon, lat float64) string {
	return `{
    "type": "Feature",
    "geometry": { "type": "Point", "coordinates": [` + ftoa(lon) + `, ` + ftoa(lat) + `] },
    "properties": {
      "_id": "x", "_index": "bi007",
      "point_id": ` + pointID + `,
      "prefecture_code": "13",
      "use_category_name_ja": "` + useCat + `",
      "u_current_years_price_ja": "` + priceJa + `",
      "last_years_price": 999999
    }
  }`
}

// TestLandAddTile_ResidentialFilter は、住宅地(00)以外を集計から除外し、住宅地のみ採用することを確かめる。
func TestLandAddTile_ResidentialFilter(t *testing.T) {
	t.Parallel()
	acc := newLandPriceAccumulator()
	tile := landTile(
		landFeat("1", "住宅地", "1,000,000(円/㎡)", 139.7, 35.6),
		landFeat("2", "商業地", "3,000,000(円/㎡)", 139.7, 35.6), // 除外されるべき
		landFeat("3", "工業地", "500,000(円/㎡)", 139.7, 35.6),   // 除外されるべき
	)
	if err := acc.addTile(strings.NewReader(tile)); err != nil {
		t.Fatalf("addTile: %v", err)
	}
	if len(acc.points) != 1 {
		t.Fatalf("採用点=%d want 1（住宅地のみ）: %+v", len(acc.points), acc.points)
	}
	if acc.points[0].PointID != "1" || acc.points[0].Yen != 1000000 {
		t.Fatalf("採用点が想定外: %+v", acc.points[0])
	}
	if acc.nonResiSkip != 2 {
		t.Fatalf("nonResiSkip=%d want 2", acc.nonResiSkip)
	}
}

// TestLandAddTile_DedupByPointID は、同一 point_id が複数タイルに出ても1回だけ計上することを確かめる。
func TestLandAddTile_DedupByPointID(t *testing.T) {
	t.Parallel()
	acc := newLandPriceAccumulator()
	if err := acc.addTile(strings.NewReader(landTile(
		landFeat("100", "住宅地", "1,200,000(円/㎡)", 139.7, 35.6),
	))); err != nil {
		t.Fatalf("addTile A: %v", err)
	}
	if err := acc.addTile(strings.NewReader(landTile(
		landFeat("100", "住宅地", "1,200,000(円/㎡)", 139.7, 35.6), // 重複（隣接タイル）
		landFeat("101", "住宅地", "800,000(円/㎡)", 139.71, 35.61), // 新規
	))); err != nil {
		t.Fatalf("addTile B: %v", err)
	}
	if len(acc.points) != 2 {
		t.Fatalf("採用点=%d want 2（重複1件除外）", len(acc.points))
	}
	if acc.dupSkipped != 1 {
		t.Fatalf("dupSkipped=%d want 1", acc.dupSkipped)
	}
}

// TestLandAddTile_BadPriceSkipped は、価格パース不能・座標欠落を採用せず数えることを確かめる。
func TestLandAddTile_BadPriceSkipped(t *testing.T) {
	t.Parallel()
	acc := newLandPriceAccumulator()
	tile := landTile(
		landFeat("1", "住宅地", "", 139.7, 35.6),               // 価格空＝棄却
		landFeat("2", "住宅地", "1,500,000(円/㎡)", 139.7, 35.6), // 正常
	)
	if err := acc.addTile(strings.NewReader(tile)); err != nil {
		t.Fatalf("addTile: %v", err)
	}
	if len(acc.points) != 1 {
		t.Fatalf("採用点=%d want 1", len(acc.points))
	}
	if acc.badPriceSkip != 1 {
		t.Fatalf("badPriceSkip=%d want 1", acc.badPriceSkip)
	}
}

// TestLandAddTile_ExtractsCoords は、座標 [lon,lat] を正しく取り込むことを確かめる（空間結合の入力）。
func TestLandAddTile_ExtractsCoords(t *testing.T) {
	t.Parallel()
	acc := newLandPriceAccumulator()
	if err := acc.addTile(strings.NewReader(landTile(
		landFeat("1", "住宅地", "1,000,000(円/㎡)", 139.7344, 35.6935),
	))); err != nil {
		t.Fatalf("addTile: %v", err)
	}
	p := acc.points[0]
	if p.Lon != 139.7344 || p.Lat != 35.6935 {
		t.Fatalf("座標が想定外: lon=%v lat=%v", p.Lon, p.Lat)
	}
}

// TestLandAddTile_RejectsNonFeatureCollection は、エラー応答（鍵切れ等）を取り違えないことを確かめる。
func TestLandAddTile_RejectsNonFeatureCollection(t *testing.T) {
	t.Parallel()
	acc := newLandPriceAccumulator()
	if err := acc.addTile(strings.NewReader(`{"statusCode":401,"message":"Access denied"}`)); err == nil {
		t.Fatal("features 無し応答をエラーにできていない（取り違え）")
	}
}
