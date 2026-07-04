package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

// agingRateMetricKey は高齢化率(2050)の metric キー。値API（?metric=...）・FE registry と一致させる。
const agingRateMetricKey = "aging_rate_2050"

// agingRateSource は本指標の出典（ADR-0011 (c) 法的要件）。推計値ゆえ「推計(2050)」を明示する
// （ADR-0009：実績と区別し断定しない）。算出由来（メッシュの PTC 合計/PTN 合計＝人口重み付き比）も残す。
const agingRateSource = "国土数値情報 将来推計人口250mメッシュ(XKT013) 推計(2050)。市区町村ごとに ΣPTC_2050/ΣPTN_2050 で算出（1都3県・65歳以上人口÷総数）"

// agingRateVintage は本指標の版（year 列＝推計の到達年 2050）。増減率(2020→2050)と対の到達年・
// 取得済み vintage（data/xkt013/2050）と一致（ADR-0009/0015）。他年次(2020 等)は同タイルから後日追加可。
const agingRateVintage = 2050

// agingMeshProps は高齢化率の集計で1メッシュから抽出する4値（XKT013 IF定義のプロパティ名に紐づく json タグ）。
//
// pop_change の meshProps と同じく必要キーだけ拾い他は Decode が読み捨てる（ストリーム抽出）。高齢化率は
// メッシュ別比 RTC_2050 を単純平均してはならない（比の平均は小さい/大きいメッシュを同重みにする誤り）。
// 必ず PTC（65歳以上人口）と PTN（総数）を市区町村へ足し上げてから割る＝人口で重みづけした比を出すため、
// 抽出するのは RTC でなく PTC/PTN の生人口。MESH_ID=重複排除キー、SHICODE=集計キー（上2桁が対象のみ採用）。
type agingMeshProps struct {
	MeshID string  `json:"MESH_ID"`
	Shi    string  `json:"SHICODE"`
	PTC50  float64 `json:"PTC_2050"` // 65歳以上人口（老年・分子）
	PTN50  float64 `json:"PTN_2050"` // 総数（分母）
}

// agingShiSum は1市区町村(SHICODE)のメッシュ合計（高齢化率の分子 ΣPTC・分母 ΣPTN）。
type agingShiSum struct {
	sumPTC float64 // Σ65歳以上人口
	sumPTN float64 // Σ総数
}

// agingRateAccumulator は複数タイルをまたいでメッシュを集計する状態（pop_change と同構造）。
//
// なぜ蓄積器を持つか：タイルは隣接で重複し（同一 MESH_ID が複数タイルに出る）、1市区町村は複数タイルに
// またがる。1枚ずつ読みつつ seen で重複排除し sums に足すことで、巨大 GeoJSON を全載せせずに市区町村合計を作る。
type agingRateAccumulator struct {
	seen map[string]struct{}     // 既出 MESH_ID（重複排除）
	sums map[string]*agingShiSum // SHICODE → メッシュ合計（上2桁が対象 1都3県 のみ）
	// 集計の可視化（層1）：処理メッシュ数・重複スキップ数・県外スキップ数。
	meshKept    int
	dupSkipped  int
	prefSkipped int
}

func newAgingRateAccumulator() *agingRateAccumulator {
	return &agingRateAccumulator{
		seen: make(map[string]struct{}),
		sums: make(map[string]*agingShiSum),
	}
}

// addTile は GeoJSON タイル1枚をストリームで読み、メッシュを蓄積器へ足し込む。
//
// pop_change.addTile と同じ流儀：json.Decoder で features 配列の要素を1つずつ復号し、必要4キーだけ持つ
// agingMeshProps へ写す（geometry・余分な properties は Decode が捨てる）。features への降下・非
// FeatureCollection の弾き・スカラ/入れ子の読み飛ばしは pop_change の seekToFeaturesArray/skipValue を共用する。
func (a *agingRateAccumulator) addTile(r io.Reader) error {
	dec := json.NewDecoder(r)
	if err := seekToFeaturesArray(dec); err != nil {
		return err
	}
	for dec.More() {
		var f struct {
			Properties agingMeshProps `json:"properties"`
		}
		if err := dec.Decode(&f); err != nil {
			return fmt.Errorf("Feature の復号に失敗: %w", err)
		}
		a.addMesh(f.Properties)
	}
	return nil
}

// addMesh は1メッシュ分を重複排除・県外除外しつつ SHICODE 合計（ΣPTC・ΣPTN）へ足す（純ロジック・層1の核）。
// pref フィルタは pop_change と同じ inTargetPref（上2桁∈{11,12,13,14}）を共用する（掛け算を避ける）。
func (a *agingRateAccumulator) addMesh(p agingMeshProps) {
	if p.MeshID == "" {
		// MESH_ID 欠落は識別不能ゆえ捨てる（重複排除も合計もできない）。実データでは起きない想定だが防御。
		return
	}
	if _, dup := a.seen[p.MeshID]; dup {
		a.dupSkipped++
		return
	}
	a.seen[p.MeshID] = struct{}{}

	// 上2桁が対象 1都3県（11/12/13/14）のみ。対象外の隣県（山梨19 等）のはみ出しメッシュは捨てる。
	if !inTargetPref(p.Shi) {
		a.prefSkipped++
		return
	}
	a.meshKept++

	s := a.sums[p.Shi]
	if s == nil {
		s = &agingShiSum{}
		a.sums[p.Shi] = s
	}
	s.sumPTC += p.PTC50
	s.sumPTN += p.PTN50
}

// agingRateRow は1市区町村の集計結果（DB 投入の中間形・status 付き）。
type agingRateRow struct {
	Shi    string  // 5桁 SHICODE
	Rate   float64 // 高齢化率（例 0.35 = 35%）。status!=present のときは未使用
	Status string  // present / none（ADR-0011）
}

// rates は蓄積器から市区町村ごとの高齢化率を作る（純関数・層1テスト対象）。
//
// 高齢化率 = ΣPTC_2050 / ΣPTN_2050（＝65歳以上人口の合計 ÷ 総数の合計＝人口で重みづけした比）。
// **メッシュ別比 RTC の単純平均ではない**（比の平均は誤り）。ΣPTN_2050==0（その市区町村にメッシュ
// 人口が無い＝分母0）は率が定義できないため status=none・値なし（0除算回避・ADR-0011 データなし）。
// 結果は SHICODE 昇順（決定的な順序＝テスト・ログの再現性）。
func (a *agingRateAccumulator) rates() []agingRateRow {
	codes := make([]string, 0, len(a.sums))
	for c := range a.sums {
		codes = append(codes, c)
	}
	sort.Strings(codes)

	rows := make([]agingRateRow, 0, len(codes))
	for _, c := range codes {
		s := a.sums[c]
		if s.sumPTN == 0 {
			rows = append(rows, agingRateRow{Shi: c, Status: "none"})
			continue
		}
		rows = append(rows, agingRateRow{
			Shi:    c,
			Rate:   s.sumPTC / s.sumPTN,
			Status: "present",
		})
	}
	return rows
}

// AgingRateResult は高齢化率投入の結果要約（ログ・層1検証用）。
type AgingRateResult struct {
	Metric      string  // 投入指標キー
	Inserted    int     // metric_value へ投入した行数
	Present     int     // status=present（率が出た）行数
	None        int     // status=none（分母0・データなし）行数
	MeshKept    int     // 集計に採用したメッシュ数（重複排除・県内のみ）
	DupSkipped  int     // 重複でスキップしたメッシュ数
	PrefSkipped int     // 県外でスキップしたメッシュ数
	MinRate     float64 // present の最小高齢化率（層1：桁外れが無いか）
	MaxRate     float64 // present の最大高齢化率（層1：>1 が無いか）
}

// ComputeAgingRate は data/xkt013/<vintage> 配下の GeoJSON タイル群を集計し metric_value へ書き込む（冪等）。
//
// 設計（ADR-0009 主軸＝将来推計人口・高齢化率は別の顔／ADR-0015 縦持ち／ADR-0011 データなし／ADR-0030 波p）：
//   - タイル群をストリーム抽出（MESH_ID/SHICODE/PTC_2050/PTN_2050 のみ）→ MESH_ID 重複排除 →
//     SHICODE 上2桁が対象 1都3県 → SHICODE ごとに ΣPTC_2050/ΣPTN_2050 → 高齢化率（人口重み付き比）。
//   - SHICODE が admin_unit に在る行だけ INSERT（FK 担保＝ADR-0014 マスタに在るコードのみ採用）。
//   - admin_unit にあって集計データが無い市区町村（東京島嶼等で未取得）は status=none・値なしで埋める。
//   - 冪等：metric 単位 DELETE→INSERT。実行後アサート（件数妥当・値域 0<率<1・pref のみ）で層1を守る。
//
// dataDir は data/xkt013/<vintage>（pref サブディレクトリ配下にタイルが並ぶ）を再帰探索する（pop_change と同）。
// 鍵・取得は要らず（ファイルは fetch-xkt013.sh が用意済み）DB 接続のみ＝層1検証を取得の不確実性から切り離す。
func ComputeAgingRate(ctx context.Context, dsn, dataDir string) (AgingRateResult, error) {
	acc, err := aggregateAgingDir(dataDir)
	if err != nil {
		return AgingRateResult{}, err
	}
	rows := acc.rates()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		// dsn にはパスワードが含まれるため、エラーに dsn を載せない。
		return AgingRateResult{}, fmt.Errorf("DB へ接続できない（POSTGRES_* と DB 起動を確認）: %w", err)
	}
	defer conn.Close(ctx)

	tx, err := conn.Begin(ctx)
	if err != nil {
		return AgingRateResult{}, fmt.Errorf("トランザクション開始に失敗: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // commit 済みなら no-op

	res, err := writeAgingRate(ctx, tx, rows, acc)
	if err != nil {
		return AgingRateResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return AgingRateResult{}, fmt.Errorf("コミットに失敗: %w", err)
	}
	return res, nil
}

// aggregateAgingDir は dataDir 配下（pref サブディレクトリ含む）の *.geojson を1枚ずつストリーム集計して返す。
// 配置規約 data/xkt013/<vintage>/<pref>/*.geojson ゆえ再帰的に集める（pop_change の aggregateDir と同流儀）。
func aggregateAgingDir(dataDir string) (*agingRateAccumulator, error) {
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
		return nil, fmt.Errorf("タイルが無い（%s 配下）。先に scripts/fetch-xkt013.sh で取得する", dataDir)
	}
	sort.Strings(files) // 決定的な処理順（ログの再現性）。

	acc := newAgingRateAccumulator()
	for _, path := range files {
		if err := addAgingTileFile(acc, path); err != nil {
			return nil, err
		}
	}
	return acc, nil
}

// addAgingTileFile は1ファイルを開いて addTile に渡し、必ず閉じる（ハンドルを溜めない）。
func addAgingTileFile(acc *agingRateAccumulator, path string) error {
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

// writeAgingRate は集計結果を metric_value へ冪等投入し、実行後アサート（層1）を返す。
//
// 投入規則は pop_change の writePopChange と同思想：(1) metric 単位 DELETE→INSERT で冪等。
// (2) admin_unit(対象 1都3県・municipality)の全単位を母集合に、集計があれば present/none、集計に
// 現れない単位（島嶼等で未取得）は status=none で埋める。(3) FK ゆえ admin_unit に無い SHICODE は捨てる。
func writeAgingRate(ctx context.Context, tx pgx.Tx, rows []agingRateRow, acc *agingRateAccumulator) (AgingRateResult, error) {
	// 冪等：当該 metric の既存行を消してから入れ直す（何度流しても同結果）。
	if _, err := tx.Exec(ctx, `DELETE FROM metric_value WHERE metric = $1`, agingRateMetricKey); err != nil {
		return AgingRateResult{}, fmt.Errorf("既存 metric_value(metric=%s) の削除に失敗: %w", agingRateMetricKey, err)
	}

	// admin_unit にある対象 1都3県の市区町村コード集合を取る（FK 母集合・未取得単位の none 埋め用）。
	// targetAdminCodes は pop_change と共用（対象 pref・municipality を昇順で返す）。
	adminCodes, err := targetAdminCodes(ctx, tx)
	if err != nil {
		return AgingRateResult{}, err
	}
	if len(adminCodes) == 0 {
		return AgingRateResult{}, fmt.Errorf("admin_unit に対象 1都3県(%v)の市区町村が無い。先に make ingest-n03 で各県を投入", popChangePrefixes)
	}

	// 集計行を SHICODE で引けるように索引化（admin_unit に在るものだけ採用）。
	byShi := make(map[string]agingRateRow, len(rows))
	for _, r := range rows {
		byShi[r.Shi] = r
	}

	const insertSQL = `
INSERT INTO metric_value (unit_id, unit_kind, metric, value, status, year, source)
VALUES ($1, 'municipality', $2, $3, $4, $5, $6)`

	inserted, present, none := 0, 0, 0
	minRate, maxRate := math.Inf(1), math.Inf(-1)
	for _, code := range adminCodes {
		r, ok := byShi[code]
		var (
			value  *float64
			status string
		)
		switch {
		case ok && r.Status == "present":
			rate := r.Rate
			value = &rate
			status = "present"
			present++
			if rate < minRate {
				minRate = rate
			}
			if rate > maxRate {
				maxRate = rate
			}
		default:
			// 集計に無い（島嶼等で未取得）or 分母0（rates が none）＝データなし。値は持たない。
			status = "none"
			none++
		}
		if _, err := tx.Exec(ctx, insertSQL, code, agingRateMetricKey, value, status, agingRateVintage, agingRateSource); err != nil {
			return AgingRateResult{}, fmt.Errorf("metric_value への INSERT に失敗（unit_id=%s）: %w", code, err)
		}
		inserted++
	}

	res := AgingRateResult{
		Metric:      agingRateMetricKey,
		Inserted:    inserted,
		Present:     present,
		None:        none,
		MeshKept:    acc.meshKept,
		DupSkipped:  acc.dupSkipped,
		PrefSkipped: acc.prefSkipped,
		MinRate:     minRate,
		MaxRate:     maxRate,
	}
	if err := assertAgingRate(ctx, tx, res); err != nil {
		return AgingRateResult{}, err
	}
	return res, nil
}

// assertAgingRate は投入の事後チェック（層1＝データの正しさ）。失敗は具体値付きで返しロールバックさせる。
//
// 検証項目：(1) 投入>0 (2) present>0（全件 none は集計失敗の兆候） (3) 全 unit_id が対象 1都3県
// (4) present の率が比の値域（0<率<1＝人口比は0〜1・0以下や1以上は ΣPTC/ΣPTN の取り違えの兆候。
//
//	実データの高齢化率は概ね0.2〜0.5） (5) present は value 必須・none は value=NULL（CHECK と二重防御）。
func assertAgingRate(ctx context.Context, tx pgx.Tx, res AgingRateResult) error {
	if res.Inserted <= 0 {
		return fmt.Errorf("投入件数が0。admin_unit(対象 1都3県) とタイルの取得を確認")
	}
	if res.Present <= 0 {
		return fmt.Errorf("present が0件（全て none）。タイルの SHICODE/PTC/PTN 抽出か上2桁フィルタを確認")
	}

	// 上2桁が対象 1都3県 以外が紛れていないか（FK は実在を見るが pref は見ないため明示チェック）。
	var badPref int
	if err := tx.QueryRow(ctx,
		`SELECT count(*) FROM metric_value WHERE metric = $1 AND left(unit_id, 2) <> ALL($2)`,
		agingRateMetricKey, popChangePrefixes).Scan(&badPref); err != nil {
		return fmt.Errorf("pref チェックの集計に失敗: %w", err)
	}
	if badPref != 0 {
		return fmt.Errorf("上2桁が対象 1都3県 でない行が %d 件ある（県外混入）", badPref)
	}

	// status と value の整合（present=値あり / none=値なし）。CHECK もあるが層1を可視化。
	var badStatus int
	if err := tx.QueryRow(ctx, `
SELECT count(*) FROM metric_value
WHERE metric = $1
  AND ( (status = 'present' AND value IS NULL)
     OR (status = 'none'    AND value IS NOT NULL) )`, agingRateMetricKey).Scan(&badStatus); err != nil {
		return fmt.Errorf("status/value 整合チェックの集計に失敗: %w", err)
	}
	if badStatus != 0 {
		return fmt.Errorf("status と value が矛盾する行が %d 件ある", badStatus)
	}

	// present の率の値域。高齢化率は人口比ゆえ 0<率<1。0以下や1以上は ΣPTC/ΣPTN の取り違え・分子分母逆の兆候。
	var minV, maxV float64
	if err := tx.QueryRow(ctx, `
SELECT min(value), max(value) FROM metric_value
WHERE metric = $1 AND status = 'present'`, agingRateMetricKey).Scan(&minV, &maxV); err != nil {
		return fmt.Errorf("率の値域集計に失敗: %w", err)
	}
	if minV <= 0.0 || maxV >= 1.0 {
		return fmt.Errorf("高齢化率が比の範囲外（min=%.4f max=%.4f）。ΣPTC/ΣPTN・分子分母の向きを確認", minV, maxV)
	}

	return nil
}
