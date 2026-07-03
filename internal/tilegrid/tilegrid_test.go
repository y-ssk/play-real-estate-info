package tilegrid

import "testing"

// TestRangeFor_KnownTokyoCenter は、都心付近の1点近傍が既知のタイル番号（GSI tileCoordCheck / 標準式）に
// 落ちることを確かめる。z=13 で経度 139.734/緯度 35.693（千代田区付近＝recon で地価点が出たタイル）は
// x=7275 y=3225 に入る（recon 時の取得タイルと一致＝式の裏取り）。
func TestRangeFor_KnownTokyoCenter(t *testing.T) {
	t.Parallel()
	// 1点をわずかに囲む極小 bbox（同一タイルに収まる）。
	b := BBox{MinLon: 139.734, MinLat: 35.693, MaxLon: 139.735, MaxLat: 35.694}
	r, err := RangeFor(b, 13)
	if err != nil {
		t.Fatalf("RangeFor: %v", err)
	}
	if r.XMin != 7275 || r.XMax != 7275 || r.YMin != 3225 || r.YMax != 3225 {
		t.Fatalf("都心タイルが想定外: %+v want x=7275 y=3225", r)
	}
	if r.Count() != 1 {
		t.Fatalf("Count=%d want 1", r.Count())
	}
}

// TestRangeFor_YOrientation は、緯度の向き（北ほど y 小・南ほど y 大）を取り違えないことを確かめる。
// 南北に広い bbox で YMin(北端由来) < YMax(南端由来) になる。
func TestRangeFor_YOrientation(t *testing.T) {
	t.Parallel()
	b := BBox{MinLon: 139.5, MinLat: 35.5, MaxLon: 139.6, MaxLat: 36.0}
	r, err := RangeFor(b, 13)
	if err != nil {
		t.Fatalf("RangeFor: %v", err)
	}
	if r.YMin >= r.YMax {
		t.Fatalf("南北で YMin<YMax にならない: %+v（北端→YMin・南端→YMax の取り違えを疑う）", r)
	}
	if r.XMin > r.XMax {
		t.Fatalf("東西で XMin<=XMax にならない: %+v", r)
	}
}

// TestRangeFor_Count は Count()/Tiles() が格子枚数と一致し、列挙が行優先で決定的なことを確かめる。
func TestRangeFor_Count(t *testing.T) {
	t.Parallel()
	r := Range{Z: 13, XMin: 10, XMax: 12, YMin: 20, YMax: 21} // 3×2=6
	if r.Count() != 6 {
		t.Fatalf("Count=%d want 6", r.Count())
	}
	tiles := r.Tiles()
	if len(tiles) != 6 {
		t.Fatalf("Tiles len=%d want 6", len(tiles))
	}
	// 先頭は (10,20)、次は (10,21)（x 固定で y 昇順→次の x）。
	if tiles[0] != (Tile{13, 10, 20}) || tiles[1] != (Tile{13, 10, 21}) || tiles[2] != (Tile{13, 11, 20}) {
		t.Fatalf("列挙順が行優先でない: %+v", tiles[:3])
	}
}

// TestRangeFor_ZoomDoublesGrid は、z を1上げるとタイル番号が概ね倍化する（各段で2^z）ことを確かめる。
// 同一 bbox で z=13→14 の XMin がおよそ2倍になる（Slippy Map の性質）。
func TestRangeFor_ZoomDoublesGrid(t *testing.T) {
	t.Parallel()
	b := BBox{MinLon: 139.7, MinLat: 35.6, MaxLon: 139.8, MaxLat: 35.7}
	r13, err := RangeFor(b, 13)
	if err != nil {
		t.Fatalf("z13: %v", err)
	}
	r14, err := RangeFor(b, 14)
	if err != nil {
		t.Fatalf("z14: %v", err)
	}
	if !(r14.XMin == 2*r13.XMin || r14.XMin == 2*r13.XMin+1) {
		t.Fatalf("z14 の XMin が z13 の約2倍でない: z13=%d z14=%d", r13.XMin, r14.XMin)
	}
}

// TestValid_RejectsBadBBox は、経度緯度の取り違え・南北反転・範囲外を弾くことを確かめる（早期防御）。
func TestValid_RejectsBadBBox(t *testing.T) {
	t.Parallel()
	cases := map[string]BBox{
		"西>東":      {MinLon: 140, MinLat: 35, MaxLon: 139, MaxLat: 36},
		"南>北":      {MinLon: 139, MinLat: 36, MaxLon: 140, MaxLat: 35},
		"緯度メルカトル外": {MinLon: 139, MinLat: 35, MaxLon: 140, MaxLat: 89},
		"経度180外":   {MinLon: 139, MinLat: 35, MaxLon: 181, MaxLat: 36},
	}
	for name, b := range cases {
		if err := b.Valid(); err == nil {
			t.Errorf("%s: 不正 bbox を弾けていない: %+v", name, b)
		}
	}
}

// TestRangeFor_RejectsBadZoom は、API 制約外の z（負・過大）を弾くことを確かめる。
func TestRangeFor_RejectsBadZoom(t *testing.T) {
	t.Parallel()
	b := BBox{MinLon: 139, MinLat: 35, MaxLon: 140, MaxLat: 36}
	if _, err := RangeFor(b, -1); err == nil {
		t.Error("z=-1 を弾けていない")
	}
	if _, err := RangeFor(b, 23); err == nil {
		t.Error("z=23 を弾けていない")
	}
}
