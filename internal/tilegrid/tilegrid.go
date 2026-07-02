// Package tilegrid は「対象エリアの緯度経度矩形(bbox) → XYZ タイル(z/x/y)範囲」を求める汎用ヘルパー。
//
// なぜ独立パッケージか（ADR-0030 継ぎ目b＝タイル取得型指標のエリア・パラメータ化）：
// タイルで配布される MLIT 指標（地価 XPT002・将来人口 XKT013・災害…）は、対象エリアを覆うタイルを
// スイープ取得する。従来 fetch-xkt013.sh は東京グリッドを決め打ちしていたが、エリアを波（1都3県→…）で
// 広げるたびにグリッドを手で書くのは掛け算の温床（ADR-0030）。よって「bbox→タイル範囲」を一箇所の
// 汎用ロジックにし、地価・人口・災害が同じ計算を共有する（地価専用にしない）。
//
// XYZ タイルは Web メルカトル（EPSG:3857）前提の Slippy Map 方式。admin_unit の bbox は経度/緯度
// （EPSG:6668＝JGD2011 地理座標。WGS84 と実用上同一）で得られるため、ここで経度/緯度→タイル番号へ
// 変換する（標準の Slippy Map 式）。z は指標の API 制約で決める（XPT002 は 13〜15。呼び出し側が渡す）。
package tilegrid

import (
	"fmt"
	"math"
)

// BBox は緯度経度の矩形（度）。admin_unit の ST_Extent や明示 bbox から作る。
//
// 経度は西端 MinLon〜東端 MaxLon、緯度は南端 MinLat〜北端 MaxLat。ADR-0030 は「ST_Extent または明示
// bbox」の両方を認める：東京都の ST_Extent は島嶼（伊豆・小笠原）まで含み矩形が巨大化しタイルが爆発する
// ため、本土に限定した明示 bbox を渡す用途がある（呼び出し側の判断）。
type BBox struct {
	MinLon float64
	MinLat float64
	MaxLon float64
	MaxLat float64
}

// Valid は矩形の健全性（西<東・南<北・緯度が Web メルカトルの有効範囲内）を確かめる。
//
// なぜ緯度上限を約 85.0511 度にするか：Web メルカトル（Slippy Map）は極付近で y が発散するため、
// 標準の有効緯度 ±85.05112878 度でクランプ/検証するのが約束事。日本の bbox は十分内側だが、
// 取り違えた bbox（0 埋め・経度緯度の入れ替え）を早期に弾く防御。
func (b BBox) Valid() error {
	const maxMercatorLat = 85.05112878
	if !(b.MinLon < b.MaxLon) {
		return fmt.Errorf("経度が西<東でない（MinLon=%g MaxLon=%g）。bbox の取り違えを疑う", b.MinLon, b.MaxLon)
	}
	if !(b.MinLat < b.MaxLat) {
		return fmt.Errorf("緯度が南<北でない（MinLat=%g MaxLat=%g）。bbox の取り違えを疑う", b.MinLat, b.MaxLat)
	}
	if b.MinLat < -maxMercatorLat || b.MaxLat > maxMercatorLat {
		return fmt.Errorf("緯度が Web メルカトル有効範囲(±%.5f)外（MinLat=%g MaxLat=%g）", maxMercatorLat, b.MinLat, b.MaxLat)
	}
	if b.MinLon < -180 || b.MaxLon > 180 {
		return fmt.Errorf("経度が [-180,180] 外（MinLon=%g MaxLon=%g）", b.MinLon, b.MaxLon)
	}
	return nil
}

// Range は BBox を z で覆う XYZ タイル番号の範囲（両端含む）。XMin..XMax × YMin..YMax の格子。
type Range struct {
	Z    int
	XMin int
	XMax int
	YMin int
	YMax int
}

// Count は範囲が含むタイル枚数（スイープ取得の件数＝レート制御・所要時間の見積りに使う）。
func (r Range) Count() int {
	return (r.XMax - r.XMin + 1) * (r.YMax - r.YMin + 1)
}

// Tile は1タイルの座標（スイープの単位）。
type Tile struct {
	Z int
	X int
	Y int
}

// Tiles は範囲内の全タイルを行優先（x 昇順→各 x で y 昇順）で列挙する（決定的な順序＝ログ・再現性）。
func (r Range) Tiles() []Tile {
	out := make([]Tile, 0, r.Count())
	for x := r.XMin; x <= r.XMax; x++ {
		for y := r.YMin; y <= r.YMax; y++ {
			out = append(out, Tile{Z: r.Z, X: x, Y: y})
		}
	}
	return out
}

// RangeFor は bbox を z で覆うタイル範囲を返す（Slippy Map 標準式・両端含む）。
//
// 変換（Web メルカトル）：
//
//	x = floor((lon+180)/360 * 2^z)
//	y = floor((1 - asinh(tan(lat_rad))/π)/2 * 2^z)
//
// 緯度は北（MaxLat）ほど y が小さく、南（MinLat）ほど y が大きい（画面上→下）ため、
// YMin は MaxLat から、YMax は MinLat から求める（南北の取り違えを起こさない）。
// z は指標の API 制約で呼び出し側が決める（XPT002 は 13〜15。ここでは 0..22 の妥当範囲のみ検証）。
func RangeFor(b BBox, z int) (Range, error) {
	if z < 0 || z > 22 {
		return Range{}, fmt.Errorf("z が範囲外（%d）。XYZ の妥当 z は 0..22（XPT002 は 13〜15）", z)
	}
	if err := b.Valid(); err != nil {
		return Range{}, err
	}

	xMin := lonToTileX(b.MinLon, z)
	xMax := lonToTileX(b.MaxLon, z)
	// 緯度は北ほど y 小・南ほど y 大。北端(MaxLat)→YMin、南端(MinLat)→YMax。
	yMin := latToTileY(b.MaxLat, z)
	yMax := latToTileY(b.MinLat, z)

	// タイル番号の上限（2^z−1）でクランプ（bbox が 180/85 度ちょうどに触れた場合の桁溢れ防御）。
	n := 1 << uint(z)
	clamp := func(v int) int {
		if v < 0 {
			return 0
		}
		if v > n-1 {
			return n - 1
		}
		return v
	}
	return Range{
		Z:    z,
		XMin: clamp(xMin),
		XMax: clamp(xMax),
		YMin: clamp(yMin),
		YMax: clamp(yMax),
	}, nil
}

// lonToTileX は経度→タイル X 番号（Slippy Map 標準）。
func lonToTileX(lon float64, z int) int {
	n := float64(int(1) << uint(z))
	return int(math.Floor((lon + 180.0) / 360.0 * n))
}

// latToTileY は緯度→タイル Y 番号（Slippy Map 標準・Web メルカトル）。
func latToTileY(lat float64, z int) int {
	n := float64(int(1) << uint(z))
	latRad := lat * math.Pi / 180.0
	return int(math.Floor((1.0 - math.Asinh(math.Tan(latRad))/math.Pi) / 2.0 * n))
}
