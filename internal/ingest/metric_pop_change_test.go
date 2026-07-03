package ingest

import (
	"math"
	"strconv"
	"strings"
	"testing"
)

// tileJSON は最小の XKT013 風 FeatureCollection を組む（properties に余分なキーを混ぜ、ストリーム抽出が
// 必要4キー以外を読み捨てることも確かめる）。features は features 以外のキー（crs/name/type）の後に置き、
// seekToFeaturesArray が並び順に依らず features へ降りられることを検証する。
func tileJSON(meshes ...string) string {
	return `{
  "type": "FeatureCollection",
  "name": "estimated_future_population",
  "crs": { "type": "name", "properties": { "name": "urn:ogc:def:crs:EPSG::6668" } },
  "features": [` + strings.Join(meshes, ",") + `]
}`
}

// mesh は1メッシュ Feature を組む。geometry は配列・入れ子を持たせ、skipValue/Decode が読み飛ばすことを確かめる。
// properties には IF にある余分なキー（PT00_2020 等）も混ぜ、抽出が4キーに絞れることを確かめる。
func mesh(meshID, shi string, ptn20, ptn50 float64) string {
	return `{
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [[[139.7,35.6],[139.7,35.61],[139.71,35.61],[139.7,35.6]]] },
    "properties": {
      "_id": "x", "_index": "bs012",
      "MESH_ID": "` + meshID + `",
      "SHICODE": "` + shi + `",
      "PT00_2020": 999.0,
      "PTN_2020": ` + ftoa(ptn20) + `,
      "RTC_2050": 0.35,
      "PTN_2050": ` + ftoa(ptn50) + `
    }
  }`
}

// ftoa は JSON 中の数値リテラル用の整形（テスト値を素直に書き出す）。
func ftoa(f float64) string {
	return strconv.FormatFloat(f, 'f', -1, 64)
}

// TestAddTile_ExtractsOnlyFourKeys は、余分なプロパティ・geometry があっても4キーだけ抽出して合計することを確かめる。
func TestAddTile_ExtractsOnlyFourKeys(t *testing.T) {
	t.Parallel()
	acc := newPopChangeAccumulator()
	tile := tileJSON(
		mesh("5339001", "13101", 100, 115), // 合成データ（100→115＝式の検証用・実データの千代田ではない）
		mesh("5339002", "13101", 100, 115),
	)
	if err := acc.addTile(strings.NewReader(tile)); err != nil {
		t.Fatalf("addTile: %v", err)
	}
	s := acc.sums["13101"]
	if s == nil {
		t.Fatal("13101 が集計されていない")
	}
	if s.sum2020 != 200 || s.sum2050 != 230 {
		t.Fatalf("合計が想定外: sum2020=%v sum2050=%v (want 200/230)", s.sum2020, s.sum2050)
	}
	if acc.meshKept != 2 {
		t.Fatalf("meshKept=%d want 2", acc.meshKept)
	}
}

// TestAddTile_DedupAcrossTiles は、同一 MESH_ID が複数タイルに出ても1回だけ計上することを確かめる（重複排除）。
func TestAddTile_DedupAcrossTiles(t *testing.T) {
	t.Parallel()
	acc := newPopChangeAccumulator()
	// タイルA・Bが MESH_ID=5339001 を重複して含む（隣接タイルの重なり）。
	if err := acc.addTile(strings.NewReader(tileJSON(mesh("5339001", "13102", 100, 124)))); err != nil {
		t.Fatalf("addTile A: %v", err)
	}
	if err := acc.addTile(strings.NewReader(tileJSON(
		mesh("5339001", "13102", 100, 124), // 重複（無視されるべき）
		mesh("5339003", "13102", 100, 124), // 新規
	))); err != nil {
		t.Fatalf("addTile B: %v", err)
	}
	if acc.dupSkipped != 1 {
		t.Fatalf("dupSkipped=%d want 1（重複1件をスキップ）", acc.dupSkipped)
	}
	s := acc.sums["13102"]
	if s.sum2020 != 200 || s.sum2050 != 248 { // 5339001 + 5339003（重複は1回だけ）
		t.Fatalf("重複排除後の合計が想定外: %v/%v want 200/248", s.sum2020, s.sum2050)
	}
}

// TestAddMesh_PrefFilter は、対象 1都3県（13/11/12/14）を採用し対象外（山梨19 等はみ出し）を除外することを確かめる。
// 波p でエリアを 1都3県へ広げたため、従来除外していた埼玉(11)/千葉(12)/神奈川(14)は採用側へ移った。
func TestAddMesh_PrefFilter(t *testing.T) {
	t.Parallel()
	acc := newPopChangeAccumulator()
	acc.addMesh(meshProps{MeshID: "a", Shi: "13101", PTN20: 100, PTN50: 110}) // 東京（採用）
	acc.addMesh(meshProps{MeshID: "b", Shi: "11202", PTN20: 100, PTN50: 110}) // 埼玉（採用）
	acc.addMesh(meshProps{MeshID: "c", Shi: "12100", PTN20: 100, PTN50: 110}) // 千葉（採用）
	acc.addMesh(meshProps{MeshID: "d", Shi: "14100", PTN20: 100, PTN50: 110}) // 神奈川（採用）
	acc.addMesh(meshProps{MeshID: "e", Shi: "19201", PTN20: 100, PTN50: 110}) // 山梨（対象外・除外）
	for _, code := range []string{"13101", "11202", "12100", "14100"} {
		if _, ok := acc.sums[code]; !ok {
			t.Fatalf("対象県 %s が集計に無い", code)
		}
	}
	if _, ok := acc.sums["19201"]; ok {
		t.Fatal("山梨(19・対象外)が集計に混入している")
	}
	if acc.prefSkipped != 1 {
		t.Fatalf("prefSkipped=%d want 1（山梨のみ除外）", acc.prefSkipped)
	}
	if len(acc.sums) != 4 {
		t.Fatalf("1都3県の4件が残るべき: %d 件", len(acc.sums))
	}
}

// TestRates_ComputesRate は増減率 = Σ2050/Σ2020 − 1 の式と、対象外 pref（山梨19）の除外を合成データで確かめる。
// 千葉(12)は波p で対象入りしたため、除外の検証には対象外の山梨(19)を使う。
func TestRates_ComputesRate(t *testing.T) {
	t.Parallel()
	acc := newPopChangeAccumulator()
	acc.addMesh(meshProps{MeshID: "a", Shi: "13101", PTN20: 1000, PTN50: 1150}) // 東京 +15.0%
	acc.addMesh(meshProps{MeshID: "b", Shi: "12100", PTN20: 1000, PTN50: 1247}) // 千葉（対象・+24.7%）
	acc.addMesh(meshProps{MeshID: "c", Shi: "19201", PTN20: 1000, PTN50: 900})  // 山梨=対象外（除外されるはず）

	rows := acc.rates()
	got := map[string]popChangeRow{}
	for _, r := range rows {
		got[r.Shi] = r
	}
	if _, ok := got["19201"]; ok {
		t.Fatal("山梨(19・対象外)が率算出に混入している")
	}
	if r := got["13101"]; r.Status != "present" || math.Abs(r.Rate-0.15) > 1e-9 {
		t.Fatalf("13101 率=%v status=%s want 0.15/present", r.Rate, r.Status)
	}
	if r := got["12100"]; r.Status != "present" || math.Abs(r.Rate-0.247) > 1e-9 {
		t.Fatalf("12100 率=%v status=%s want 0.247/present", r.Rate, r.Status)
	}
	// 結果は SHICODE 昇順（決定的）。12100 < 13101。
	if len(rows) != 2 || rows[0].Shi != "12100" || rows[1].Shi != "13101" {
		t.Fatalf("昇順でない or 件数違い: %+v", rows)
	}
}

// TestRates_Div0IsNone は、分母 ΣPTN_2020==0 を status=none（0除算回避・データなし）にすることを確かめる。
func TestRates_Div0IsNone(t *testing.T) {
	t.Parallel()
	acc := newPopChangeAccumulator()
	acc.addMesh(meshProps{MeshID: "a", Shi: "13421", PTN20: 0, PTN50: 0}) // 人口0メッシュのみ＝分母0
	rows := acc.rates()
	if len(rows) != 1 {
		t.Fatalf("1件のはず: %+v", rows)
	}
	if rows[0].Status != "none" {
		t.Fatalf("分母0は none のはず: status=%s", rows[0].Status)
	}
}

// TestAddTile_RejectsNonFeatureCollection は、エラー応答（鍵切れ等）を FeatureCollection と取り違えないことを確かめる。
func TestAddTile_RejectsNonFeatureCollection(t *testing.T) {
	t.Parallel()
	acc := newPopChangeAccumulator()
	// features を持たないオブジェクト（API エラー応答を模す）。
	err := acc.addTile(strings.NewReader(`{"statusCode":401,"message":"Access denied"}`))
	if err == nil {
		t.Fatal("features 無し応答をエラーにできていない（取り違え）")
	}
}
