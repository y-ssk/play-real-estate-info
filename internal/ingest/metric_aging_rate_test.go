package ingest

import (
	"math"
	"strings"
	"testing"
)

// agingMesh は高齢化率テスト用の1メッシュ Feature を組む（PTC=65歳以上人口・PTN=総数）。
// geometry は入れ子を持たせ skipValue/Decode の読み飛ばしを、properties には IF にある余分なキー
// （RTC_2050 等）を混ぜ、抽出が PTC/PTN の2キー（＋MESH_ID/SHICODE）に絞れることを確かめる。
// **RTC_2050 をわざと現実離れした値（0.99）にし、集計がメッシュ別比 RTC を使っていないこと**
// （使っていれば結果が0.99近傍に寄る）を炙り出す。
func agingMesh(meshID, shi string, ptc, ptn float64) string {
	return `{
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [[[139.7,35.6],[139.7,35.61],[139.71,35.61],[139.7,35.6]]] },
    "properties": {
      "_id": "x", "_index": "bs012",
      "MESH_ID": "` + meshID + `",
      "SHICODE": "` + shi + `",
      "PTN_2020": 999.0,
      "RTC_2050": 0.99,
      "PTC_2050": ` + ftoa(ptc) + `,
      "PTN_2050": ` + ftoa(ptn) + `
    }
  }`
}

// TestAgingAddTile_ExtractsPtcPtn は、余分なプロパティ・geometry があっても PTC/PTN だけ抽出して
// 合計することを確かめる（tileJSON は metric_pop_change_test の共用ヘルパを流用）。
func TestAgingAddTile_ExtractsPtcPtn(t *testing.T) {
	t.Parallel()
	acc := newAgingRateAccumulator()
	tile := tileJSON(
		agingMesh("5339001", "13101", 30, 100), // 65歳以上30/総数100
		agingMesh("5339002", "13101", 40, 100),
	)
	if err := acc.addTile(strings.NewReader(tile)); err != nil {
		t.Fatalf("addTile: %v", err)
	}
	s := acc.sums["13101"]
	if s == nil {
		t.Fatal("13101 が集計されていない")
	}
	if s.sumPTC != 70 || s.sumPTN != 200 {
		t.Fatalf("合計が想定外: sumPTC=%v sumPTN=%v (want 70/200)", s.sumPTC, s.sumPTN)
	}
	if acc.meshKept != 2 {
		t.Fatalf("meshKept=%d want 2", acc.meshKept)
	}
}

// TestAgingRates_IsWeightedRatioNotMeanOfRatios は本スライスの核＝「比の平均でなく人口重み付き比」を
// 証明する。大メッシュ（総数900・高齢化率10%）と小メッシュ（総数100・高齢化率90%）を混ぜる：
//   - 正しい式 ΣPTC/ΣPTN = (90+90)/(900+100) = 180/1000 = 0.18
//   - 誤った式（メッシュ別比 RTC の単純平均） = (0.10+0.90)/2 = 0.50
//
// 結果が 0.18 であること（0.50 でないこと）で、大小メッシュを人口で重みづけしていることを確かめる。
func TestAgingRates_IsWeightedRatioNotMeanOfRatios(t *testing.T) {
	t.Parallel()
	acc := newAgingRateAccumulator()
	acc.addMesh(agingMeshProps{MeshID: "big", Shi: "13101", PTC50: 90, PTN50: 900})   // 高齢化率 10%・人口大
	acc.addMesh(agingMeshProps{MeshID: "small", Shi: "13101", PTC50: 90, PTN50: 100}) // 高齢化率 90%・人口小

	rows := acc.rates()
	if len(rows) != 1 {
		t.Fatalf("1件のはず: %+v", rows)
	}
	got := rows[0]
	if got.Status != "present" {
		t.Fatalf("status=%s want present", got.Status)
	}
	const want = 0.18 // ΣPTC/ΣPTN = 180/1000（比の平均 0.50 ではない）
	if math.Abs(got.Rate-want) > 1e-9 {
		t.Fatalf("高齢化率=%v want %v（人口重み付き比。%.2f なら比の単純平均の誤り）", got.Rate, want, 0.50)
	}
}

// TestAgingAddTile_DedupAcrossTiles は、同一 MESH_ID が複数タイルに出ても1回だけ計上することを確かめる（重複排除）。
func TestAgingAddTile_DedupAcrossTiles(t *testing.T) {
	t.Parallel()
	acc := newAgingRateAccumulator()
	if err := acc.addTile(strings.NewReader(tileJSON(agingMesh("5339001", "13102", 35, 100)))); err != nil {
		t.Fatalf("addTile A: %v", err)
	}
	if err := acc.addTile(strings.NewReader(tileJSON(
		agingMesh("5339001", "13102", 35, 100), // 重複（無視されるべき）
		agingMesh("5339003", "13102", 25, 100), // 新規
	))); err != nil {
		t.Fatalf("addTile B: %v", err)
	}
	if acc.dupSkipped != 1 {
		t.Fatalf("dupSkipped=%d want 1（重複1件をスキップ）", acc.dupSkipped)
	}
	s := acc.sums["13102"]
	if s.sumPTC != 60 || s.sumPTN != 200 { // 5339001 + 5339003（重複は1回だけ）
		t.Fatalf("重複排除後の合計が想定外: %v/%v want 60/200", s.sumPTC, s.sumPTN)
	}
}

// TestAgingAddMesh_PrefFilter は、対象 1都3県（13/11/12/14）を採用し対象外（山梨19 等はみ出し）を除外することを確かめる。
func TestAgingAddMesh_PrefFilter(t *testing.T) {
	t.Parallel()
	acc := newAgingRateAccumulator()
	acc.addMesh(agingMeshProps{MeshID: "a", Shi: "13101", PTC50: 30, PTN50: 100}) // 東京（採用）
	acc.addMesh(agingMeshProps{MeshID: "b", Shi: "11202", PTC50: 30, PTN50: 100}) // 埼玉（採用）
	acc.addMesh(agingMeshProps{MeshID: "c", Shi: "12100", PTC50: 30, PTN50: 100}) // 千葉（採用）
	acc.addMesh(agingMeshProps{MeshID: "d", Shi: "14100", PTC50: 30, PTN50: 100}) // 神奈川（採用）
	acc.addMesh(agingMeshProps{MeshID: "e", Shi: "19201", PTC50: 30, PTN50: 100}) // 山梨（対象外・除外）
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

// TestAgingRates_Div0IsNone は、分母 ΣPTN_2050==0 を status=none（0除算回避・データなし・ADR-0011）にすることを確かめる。
func TestAgingRates_Div0IsNone(t *testing.T) {
	t.Parallel()
	acc := newAgingRateAccumulator()
	acc.addMesh(agingMeshProps{MeshID: "a", Shi: "13421", PTC50: 0, PTN50: 0}) // 人口0メッシュのみ＝分母0
	rows := acc.rates()
	if len(rows) != 1 {
		t.Fatalf("1件のはず: %+v", rows)
	}
	if rows[0].Status != "none" {
		t.Fatalf("分母0は none のはず: status=%s", rows[0].Status)
	}
}

// TestAgingRates_AscendingOrder は結果が SHICODE 昇順（決定的）で返ることを確かめる（ログ・テストの再現性）。
func TestAgingRates_AscendingOrder(t *testing.T) {
	t.Parallel()
	acc := newAgingRateAccumulator()
	acc.addMesh(agingMeshProps{MeshID: "a", Shi: "13101", PTC50: 30, PTN50: 100})
	acc.addMesh(agingMeshProps{MeshID: "b", Shi: "12100", PTC50: 40, PTN50: 100})
	rows := acc.rates()
	if len(rows) != 2 || rows[0].Shi != "12100" || rows[1].Shi != "13101" {
		t.Fatalf("昇順でない or 件数違い: %+v", rows)
	}
}
