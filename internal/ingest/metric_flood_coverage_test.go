package ingest

import (
	"strings"
	"testing"
)

// floodTile は最小の XKT026 風 FeatureCollection を組む（features は crs/name の後に置き、
// seekToFeaturesArray が並び順に依らず降りられることも兼ねて確かめる）。
func floodTile(feats ...string) string {
	return `{
  "type": "FeatureCollection",
  "name": "flood_area_maximum_scale",
  "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::6668" } },
  "features": [` + strings.Join(feats, ",") + `]
}`
}

// floodFeat は1浸水域 Feature を組む（geometry は Polygon）。properties に IF の項目＋未文書キー
// （_id/_index）を混ぜ、抽出が geometry だけに絞れる（properties を読み捨てる）ことを確かめる。
func floodFeat(geomType, coords string) string {
	return `{
    "type": "Feature",
    "geometry": { "type": "` + geomType + `", "coordinates": ` + coords + ` },
    "properties": {
      "A31a_201": "8404090001",
      "A31a_202": "庄川",
      "A31a_205": 1,
      "_id": "1JpogpkB2Vp85Hbx6M82",
      "_index": "bs030_flood_area_maximum_scale"
    }
  }`
}

// simplePolyCoords は1リングの単純な四角ポリゴンの coordinates（EPSG:6668＝lon,lat 順）。
const simplePolyCoords = `[[[139.70,35.60],[139.70,35.61],[139.71,35.61],[139.71,35.60],[139.70,35.60]]]`

// TestFloodAddTile_KeepsPolygon は、Polygon の geometry を只取りして GeoJSON 文字列で保持することを確かめる
// （coordinates を Go でパースし直さず、ST_GeomFromGeoJSON が解釈できる形で持つ・§4）。
func TestFloodAddTile_KeepsPolygon(t *testing.T) {
	t.Parallel()
	acc := newFloodAccumulator()
	if err := acc.addTile(strings.NewReader(floodTile(
		floodFeat("Polygon", simplePolyCoords),
	))); err != nil {
		t.Fatalf("addTile: %v", err)
	}
	if len(acc.polygons) != 1 {
		t.Fatalf("採用ポリゴン=%d want 1", len(acc.polygons))
	}
	gj := acc.polygons[0].geoJSON
	// type=Polygon で始まり、coordinates に元の座標列が保持されていること（座標の取り違えが無いか）。
	if !strings.HasPrefix(gj, `{"type":"Polygon","coordinates":`) {
		t.Fatalf("GeoJSON の組み立てが想定外: %s", gj)
	}
	if !strings.Contains(gj, "139.71") || !strings.Contains(gj, "35.61") {
		t.Fatalf("coordinates が保持されていない: %s", gj)
	}
}

// TestFloodAddTile_RejectsNonPolygon は、Polygon 以外の geometry（想定外の型）を採らないことを確かめる。
// XKT026 は Polygon（IF §3）ゆえ MultiPolygon 等が来たら取り違えとして落とす（防御）。
func TestFloodAddTile_RejectsNonPolygon(t *testing.T) {
	t.Parallel()
	acc := newFloodAccumulator()
	if err := acc.addTile(strings.NewReader(floodTile(
		floodFeat("Polygon", simplePolyCoords),              // 採用
		floodFeat("Point", `[139.70,35.60]`),                // 除外（点）
		floodFeat("MultiPolygon", `[`+simplePolyCoords+`]`), // 除外（想定外型）
	))); err != nil {
		t.Fatalf("addTile: %v", err)
	}
	if len(acc.polygons) != 1 {
		t.Fatalf("採用ポリゴン=%d want 1（Polygon のみ）", len(acc.polygons))
	}
}

// TestFloodAddTile_RejectsMissingCoords は、coordinates 欠落（面を成さない）を採らないことを確かめる。
func TestFloodAddTile_RejectsMissingCoords(t *testing.T) {
	t.Parallel()
	acc := newFloodAccumulator()
	// coordinates キーを持たない geometry（type だけ）。addFeature が空 coordinates を弾く。
	feat := `{ "type":"Feature", "geometry": { "type":"Polygon" }, "properties": {} }`
	if err := acc.addTile(strings.NewReader(floodTile(feat))); err != nil {
		t.Fatalf("addTile: %v", err)
	}
	if len(acc.polygons) != 0 {
		t.Fatalf("採用ポリゴン=%d want 0（座標欠落は棄却）", len(acc.polygons))
	}
}

// TestFloodAddTile_AcrossTiles は、複数タイル（=複数ファイル相当）の Polygon を全て蓄積することを確かめる。
// 重複排除はここでやらず SQL の ST_Union に委ねる設計ゆえ、タイル分割・境界重複の断片も全て載る（§4・R1）。
func TestFloodAddTile_AcrossTiles(t *testing.T) {
	t.Parallel()
	acc := newFloodAccumulator()
	if err := acc.addTile(strings.NewReader(floodTile(
		floodFeat("Polygon", simplePolyCoords),
	))); err != nil {
		t.Fatalf("addTile A: %v", err)
	}
	if err := acc.addTile(strings.NewReader(floodTile(
		floodFeat("Polygon", simplePolyCoords), // 隣接タイルの断片（重複でも排除しない）
		floodFeat("Polygon", simplePolyCoords),
	))); err != nil {
		t.Fatalf("addTile B: %v", err)
	}
	if len(acc.polygons) != 3 {
		t.Fatalf("採用ポリゴン=%d want 3（結合は SQL 側ゆえパース段では排除しない）", len(acc.polygons))
	}
}

// TestFloodAddTile_RejectsNonFeatureCollection は、エラー応答（鍵切れ等）を取り違えないことを確かめる。
func TestFloodAddTile_RejectsNonFeatureCollection(t *testing.T) {
	t.Parallel()
	acc := newFloodAccumulator()
	if err := acc.addTile(strings.NewReader(`{"statusCode":401,"message":"Access denied"}`)); err == nil {
		t.Fatal("features 無し応答をエラーにできていない（取り違え）")
	}
}
