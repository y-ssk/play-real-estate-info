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

// popChangeMetricKey は将来人口増減率(2020→2050)の metric キー。値API（?metric=...）と一致させる。
const popChangeMetricKey = "pop_change_rate_2020_2050"

// popChangeSource は本指標の出典（ADR-0011 (c) 法的要件）。推計値ゆえ「推計(2020→2050)」を明示する
// （ADR-0009：実績と区別し断定しない）。算出由来（メッシュ合計の比）も残す＝由来をたどれるようにする。
const popChangeSource = "国土数値情報 将来推計人口250mメッシュ(XKT013) 推計(2020→2050)。市区町村ごとに ΣPTN_2050/ΣPTN_2020−1 で算出（1都3県）"

// popChangeVintage は本指標の版（year 列・指標の版＝推計の到達年 2050）。
// 面積（year NULL）と違い、人口増減率は「2020→2050 の推計」という年次の意味を持つため版を記す（ADR-0015）。
const popChangeVintage = 2050

// popChangePrefixes は本指標の対象エリア（1都3県）の市区町村コード上2桁（ADR-0014 値域：上2桁=都道府県
// コード・ADR-0030 波1）。タイルは対象外の隣県（山梨19 等）へはみ出すため、SHICODE 上2桁がこの集合に
// 含まれるメッシュだけを集計する。他エリアは波でこのリストへ足す（掛け算を避ける・SQL/フィルタは触らない）。
//
// 従来は東京固定 "13" の単一定数だったが、波p でエリアを 1都3県へ広げるためパラメータ化した（地価
// land_price の landPricePrefixes と同流儀）。東京(13)の集計結果は不変（"13" は集合に含まれ続ける）。
var popChangePrefixes = []string{"11", "12", "13", "14"}

// inTargetPref は SHICODE 上2桁が対象エリア（1都3県）に含まれるかを返す（addMesh の県外除外・純ロジック）。
func inTargetPref(shi string) bool {
	if len(shi) < 2 {
		return false
	}
	p := shi[:2]
	for _, want := range popChangePrefixes {
		if p == want {
			return true
		}
	}
	return false
}

// shiSum は1市区町村(SHICODE)のメッシュ合計（増減率の分子・分母）。
type shiSum struct {
	sum2020 float64
	sum2050 float64
}

// popChangeAccumulator は複数タイルをまたいでメッシュを集計する状態（ストリーム処理の蓄積器）。
//
// なぜ蓄積器を持つか：タイルは隣接で重複し（同一 MESH_ID が複数タイルに出る）、1市区町村は複数タイルに
// またがる。タイルを1枚ずつ読みながら seen で重複排除し sums に足し込むことで、全メッシュ・全属性を
// 同時にメモリへ載せずに（巨大 GeoJSON 対策）市区町村合計を作る。
type popChangeAccumulator struct {
	seen map[string]struct{} // 既出 MESH_ID（重複排除）
	sums map[string]*shiSum  // SHICODE → メッシュ合計（上2桁が対象 1都3県 のみ）
	// 集計の可視化（層1）：処理メッシュ数・重複スキップ数・県外スキップ数。
	meshKept    int
	dupSkipped  int
	prefSkipped int
}

func newPopChangeAccumulator() *popChangeAccumulator {
	return &popChangeAccumulator{
		seen: make(map[string]struct{}),
		sums: make(map[string]*shiSum),
	}
}

// meshProps は1メッシュから抽出する4値（XKT013 IF定義のプロパティ名に紐づく json タグ）。
//
// 1メッシュ数百項目のうち、この4キーだけ拾い他は Decode が読み捨てる（全属性をメモリに載せない＝
// ストリーム抽出）。年次は PTN（秘匿なし生値・全年そろう）を使う（PT00 は無い年があり、PTN との差は
// 最大数人で無害＝偵察で確認済み）。MESH_ID=重複排除キー（隣接タイルで同一メッシュが二重に来る）、
// SHICODE=集計キー（上2桁が対象 1都3県 のみ採用）。
type meshProps struct {
	MeshID string  `json:"MESH_ID"`
	Shi    string  `json:"SHICODE"`
	PTN20  float64 `json:"PTN_2020"`
	PTN50  float64 `json:"PTN_2050"`
}

// addTile は GeoJSON タイル1枚をストリームで読み、メッシュを蓄積器へ足し込む。
//
// なぜトークンストリームか：1タイル ~29MB・1メッシュ数百項目ゆえ、FeatureCollection 全体を構造体へ
// 一括 Unmarshal するとメモリを食う。json.Decoder で features 配列の要素を1つずつ復号し、必要な4キー
// だけ持つ meshProps へ写す（properties の余分なキーは Decode が捨てる）。geometry も読み捨てる。
//
// 重複排除：同一 MESH_ID は最初の1回だけ採用（隣接タイルの重複は2回目以降スキップ）。
// 県外除外：SHICODE 上2桁が対象外（1都3県以外）はスキップ（タイルの隣県はみ出し分）。
func (a *popChangeAccumulator) addTile(r io.Reader) error {
	dec := json.NewDecoder(r)

	// "features" キーの値（配列）まで降りる。トップレベルは FeatureCollection オブジェクト。
	if err := seekToFeaturesArray(dec); err != nil {
		return err
	}

	// 配列の各要素（Feature）を1つずつ復号。properties だけ要るので Feature 全体の geometry は
	// 巨大だが、json.RawMessage で受けてから properties のみ Decode し直すと二度手間。代わりに
	// Feature を {Properties meshProps} の部分構造体で受ける＝geometry/その他キーは Decode が無視する。
	for dec.More() {
		var f struct {
			Properties meshProps `json:"properties"`
		}
		if err := dec.Decode(&f); err != nil {
			return fmt.Errorf("Feature の復号に失敗: %w", err)
		}
		a.addMesh(f.Properties)
	}
	return nil
}

// seekToFeaturesArray は FeatureCollection の "features" 配列の開始 '[' まで Decoder を進める。
//
// なぜトップレベルを舐めて探すか：properties の並び順は不定で（IF定義§3）、features は crs/name/type の
// 後に来ることがある。トップオブジェクトのキーを順に読み、"features" を見つけたら次トークン（配列開始 '['）を
// 1つ読み捨てて、呼び出し側が dec.More()/Decode で要素を1つずつ取り出せる位置に置く。features 以外のキーの
// 値は読み飛ばす（skipValue）。FeatureCollection でない/ features が配列でない応答はエラーにする（取り違え検出）。
func seekToFeaturesArray(dec *json.Decoder) error {
	// 先頭は '{'（オブジェクト開始）。
	tok, err := dec.Token()
	if err != nil {
		return fmt.Errorf("JSON 先頭トークンの読み取りに失敗: %w", err)
	}
	if d, ok := tok.(json.Delim); !ok || d != '{' {
		return fmt.Errorf("応答が JSON オブジェクトでない（FeatureCollection を期待）")
	}

	for dec.More() {
		// キー名（文字列）。
		keyTok, err := dec.Token()
		if err != nil {
			return fmt.Errorf("キーの読み取りに失敗: %w", err)
		}
		key, _ := keyTok.(string)
		if key == "features" {
			// 値の開始 '[' を読む（features は配列）。
			arrTok, err := dec.Token()
			if err != nil {
				return fmt.Errorf("features 値の読み取りに失敗: %w", err)
			}
			if d, ok := arrTok.(json.Delim); !ok || d != '[' {
				return fmt.Errorf("features が配列でない（GeoJSON 応答の取り違えを疑う）")
			}
			return nil
		}
		// features 以外（type/name/crs 等）の値は丸ごと読み飛ばす。
		if err := skipValue(dec); err != nil {
			return err
		}
	}
	return fmt.Errorf("features キーが見つからない（GeoJSON 応答の取り違えを疑う）")
}

// skipValue は Decoder の次の値1つ（スカラ/配列/オブジェクト）を消費して読み飛ばす。
//
// なぜ自前で書くか：Decode(&struct{}) ではネストの釣り合い（'['/']'・'{'/'}'）を取らないため、配列/
// オブジェクトを丸ごと飛ばすには Delim の深さを数える必要がある。スカラは1トークンで済む。
func skipValue(dec *json.Decoder) error {
	tok, err := dec.Token()
	if err != nil {
		return fmt.Errorf("値の読み飛ばしに失敗: %w", err)
	}
	d, ok := tok.(json.Delim)
	if !ok {
		return nil // スカラ（文字列/数値/真偽/null）は1トークンで完了。
	}
	if d != '[' && d != '{' {
		// 閉じ括弧が単独で来ることは正常な走査では起きない（防御）。
		return fmt.Errorf("予期しない区切り %q", d)
	}
	// 開き括弧。対応する閉じまで深さを数えて読み進める。
	depth := 1
	for depth > 0 {
		t, err := dec.Token()
		if err != nil {
			return fmt.Errorf("ネスト値の読み飛ばしに失敗: %w", err)
		}
		if dd, ok := t.(json.Delim); ok {
			switch dd {
			case '[', '{':
				depth++
			case ']', '}':
				depth--
			}
		}
	}
	return nil
}

// addMesh は1メッシュ分を重複排除・県外除外しつつ SHICODE 合計へ足す（純ロジック・層1の核）。
func (a *popChangeAccumulator) addMesh(p meshProps) {
	if p.MeshID == "" {
		// MESH_ID 欠落は識別不能ゆえ捨てる（重複排除も合計もできない）。実データでは起きない想定だが防御。
		return
	}
	if _, dup := a.seen[p.MeshID]; dup {
		a.dupSkipped++
		return
	}
	a.seen[p.MeshID] = struct{}{}

	// 上2桁が対象 1都3県（13/11/12/14）のみ。対象外の隣県（山梨19 等）のはみ出しメッシュは捨てる。
	if !inTargetPref(p.Shi) {
		a.prefSkipped++
		return
	}
	a.meshKept++

	s := a.sums[p.Shi]
	if s == nil {
		s = &shiSum{}
		a.sums[p.Shi] = s
	}
	s.sum2020 += p.PTN20
	s.sum2050 += p.PTN50
}

// popChangeRow は1市区町村の集計結果（DB 投入の中間形・status 付き）。
type popChangeRow struct {
	Shi    string  // 5桁 SHICODE
	Rate   float64 // 増減率（例 0.15 = +15%）。status!=present のときは未使用
	Status string  // present / none（ADR-0011）
}

// rates は蓄積器から市区町村ごとの増減率を作る（純関数・層1テスト対象）。
//
// 増減率 = ΣPTN_2050 / ΣPTN_2020 − 1（= (Σ2050−Σ2020)/Σ2020）。
// ΣPTN_2020==0（その市区町村にメッシュ人口が無い＝分母0）は率が定義できないため status=none・値なし
// （0除算回避・ADR-0011 データなし：率が引けない＝対象外扱い。秘匿 suppressed とは区別＝こちらは
// メッシュ秘匿ではなく分母不在）。結果は SHICODE 昇順（決定的な順序＝テスト・ログの再現性）。
func (a *popChangeAccumulator) rates() []popChangeRow {
	codes := make([]string, 0, len(a.sums))
	for c := range a.sums {
		codes = append(codes, c)
	}
	sort.Strings(codes)

	rows := make([]popChangeRow, 0, len(codes))
	for _, c := range codes {
		s := a.sums[c]
		if s.sum2020 == 0 {
			rows = append(rows, popChangeRow{Shi: c, Status: "none"})
			continue
		}
		rows = append(rows, popChangeRow{
			Shi:    c,
			Rate:   s.sum2050/s.sum2020 - 1,
			Status: "present",
		})
	}
	return rows
}

// PopChangeResult は人口増減率投入の結果要約（ログ・層1検証用）。
type PopChangeResult struct {
	Metric      string  // 投入指標キー
	Inserted    int     // metric_value へ投入した行数
	Present     int     // status=present（率が出た）行数
	None        int     // status=none（分母0・データなし）行数
	MeshKept    int     // 集計に採用したメッシュ数（重複排除・県内のみ）
	DupSkipped  int     // 重複でスキップしたメッシュ数
	PrefSkipped int     // 県外でスキップしたメッシュ数
	MinRate     float64 // present の最小増減率（層1：減少側の妥当性）
	MaxRate     float64 // present の最大増減率（層1：桁外れが無いか）
}

// ComputePopChangeRate は data/xkt013/<vintage> 配下の GeoJSON タイル群を集計し metric_value へ書き込む（冪等）。
//
// 設計（ADR-0009 主軸＝人口増減率・ADR-0015 縦持ち・ADR-0016 値の道・ADR-0030 波1）：
//   - タイル群をストリーム抽出（MESH_ID/SHICODE/PTN_2020/PTN_2050 のみ）→ MESH_ID 重複排除 →
//     SHICODE 上2桁が対象 1都3県 → SHICODE ごとに ΣPTN_2020/ΣPTN_2050 → 増減率。
//   - SHICODE が admin_unit に在る行だけ INSERT（FK 担保＝ADR-0014 マスタに在るコードのみ採用）。
//   - admin_unit にあって集計データが無い市区町村（東京島嶼等で未取得）は status=none・値なしで埋める
//     （データなし3区別・ADR-0011：「未調査」と「率0」を混同させない）。
//   - 冪等：metric 単位 DELETE→INSERT。実行後アサート（中央区 +24.7%・件数妥当・対象 pref のみ 等）で層1を守る。
//
// dataDir は data/xkt013/<vintage> のような「pref サブディレクトリ配下にタイルが並ぶ」ルート
// （data/xkt013/2050/13/z11_x_y.geojson 等）を再帰探索する（land_price と同流儀）。鍵・取得は要らず
// （ファイルは fetch-xkt013.sh が用意済み）DB 接続のみ＝層1検証を取得の不確実性から切り離す。
func ComputePopChangeRate(ctx context.Context, dsn, dataDir string) (PopChangeResult, error) {
	acc, err := aggregateDir(dataDir)
	if err != nil {
		return PopChangeResult{}, err
	}
	rows := acc.rates()

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		// dsn にはパスワードが含まれるため、エラーに dsn を載せない。
		return PopChangeResult{}, fmt.Errorf("DB へ接続できない（POSTGRES_* と DB 起動を確認）: %w", err)
	}
	defer conn.Close(ctx)

	tx, err := conn.Begin(ctx)
	if err != nil {
		return PopChangeResult{}, fmt.Errorf("トランザクション開始に失敗: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // commit 済みなら no-op

	res, err := writePopChange(ctx, tx, rows, acc)
	if err != nil {
		return PopChangeResult{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return PopChangeResult{}, fmt.Errorf("コミットに失敗: %w", err)
	}
	return res, nil
}

// aggregateDir は dataDir 配下（pref サブディレクトリ含む）の *.geojson を1枚ずつストリーム集計して返す。
//
// 配置規約 data/xkt013/<vintage>/<pref>/z11_x_y.geojson ゆえ再帰的に集める（pref をまたいで全メッシュを
// 1蓄積器へ）。県外はみ出しメッシュは addMesh の pref フィルタで自然に落ちる（land_price と同流儀）。
// なぜ1枚ずつ開いて閉じるか：全タイルを同時に開かず、1枚読み終えたら閉じる＝開くファイルハンドルと
// メモリを最小に保つ（巨大タイル対策）。ファイルが1枚も無ければ「先に fetch-xkt013.sh」と気づける形で落とす。
func aggregateDir(dataDir string) (*popChangeAccumulator, error) {
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

	acc := newPopChangeAccumulator()
	for _, path := range files {
		if err := addTileFile(acc, path); err != nil {
			return nil, err
		}
	}
	return acc, nil
}

// addTileFile は1ファイルを開いて addTile に渡し、必ず閉じる（ハンドルを溜めない）。
func addTileFile(acc *popChangeAccumulator, path string) error {
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

// writePopChange は集計結果を metric_value へ冪等投入し、実行後アサート（層1）を返す。
//
// 投入規則：(1) metric 単位 DELETE→INSERT で冪等。(2) admin_unit(対象 1都3県・municipality)の全単位を
// 母集合に、集計があれば present/none（rates の判定）、集計に現れない単位（島嶼等で未取得）は status=none
// で埋める。(3) FK ゆえ admin_unit に無い SHICODE は捨てる（ADR-0014：マスタに在るコードのみ）。
func writePopChange(ctx context.Context, tx pgx.Tx, rows []popChangeRow, acc *popChangeAccumulator) (PopChangeResult, error) {
	// 冪等：当該 metric の既存行を消してから入れ直す（何度流しても同結果）。
	if _, err := tx.Exec(ctx, `DELETE FROM metric_value WHERE metric = $1`, popChangeMetricKey); err != nil {
		return PopChangeResult{}, fmt.Errorf("既存 metric_value(metric=%s) の削除に失敗: %w", popChangeMetricKey, err)
	}

	// admin_unit にある対象 1都3県の市区町村コード集合を取る（FK 母集合・未取得単位の none 埋め用）。
	adminCodes, err := targetAdminCodes(ctx, tx)
	if err != nil {
		return PopChangeResult{}, err
	}
	if len(adminCodes) == 0 {
		return PopChangeResult{}, fmt.Errorf("admin_unit に対象 1都3県(%v)の市区町村が無い。先に make ingest-n03 で各県を投入", popChangePrefixes)
	}

	// 集計行を SHICODE で引けるように索引化（admin_unit に在るものだけ採用）。
	byShi := make(map[string]popChangeRow, len(rows))
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
		if _, err := tx.Exec(ctx, insertSQL, code, popChangeMetricKey, value, status, popChangeVintage, popChangeSource); err != nil {
			return PopChangeResult{}, fmt.Errorf("metric_value への INSERT に失敗（unit_id=%s）: %w", code, err)
		}
		inserted++
	}

	res := PopChangeResult{
		Metric:      popChangeMetricKey,
		Inserted:    inserted,
		Present:     present,
		None:        none,
		MeshKept:    acc.meshKept,
		DupSkipped:  acc.dupSkipped,
		PrefSkipped: acc.prefSkipped,
		MinRate:     minRate,
		MaxRate:     maxRate,
	}
	if err := assertPopChange(ctx, tx, res); err != nil {
		return PopChangeResult{}, err
	}
	return res, nil
}

// targetAdminCodes は admin_unit にある対象 1都3県(municipality)の5桁コードを昇順で返す。
// pref_code が対象集合（popChangePrefixes）に含まれる市区町村を FK 母集合とする（land_price と同思想）。
func targetAdminCodes(ctx context.Context, tx pgx.Tx) ([]string, error) {
	rows, err := tx.Query(ctx,
		`SELECT code FROM admin_unit WHERE pref_code = ANY($1) AND unit_kind = 'municipality' ORDER BY code`,
		popChangePrefixes)
	if err != nil {
		return nil, fmt.Errorf("admin_unit(対象 1都3県) の取得に失敗: %w", err)
	}
	defer rows.Close()
	var codes []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, fmt.Errorf("admin_unit code の読み取りに失敗: %w", err)
		}
		codes = append(codes, c)
	}
	return codes, rows.Err()
}

// assertPopChange は投入の事後チェック（層1＝データの正しさ）。失敗は具体値付きで返しロールバックさせる。
//
// 検証項目：(1) 投入>0 (2) present>0（全件 none は集計失敗の兆候） (3) 全 unit_id が対象 1都3県
// (4) present の率が現実的範囲（-1<率<10＝半世紀で人口が消える/11倍超は算出バグの兆候）
// (5) present は value 必須・none は value=NULL（CHECK と二重防御） (6) サンプル（中央区 13102）の率が
// 想定 +24.7% 近傍（集計ロジックの取り違え検出。偵察と全集計が一致する安定値）。
func assertPopChange(ctx context.Context, tx pgx.Tx, res PopChangeResult) error {
	if res.Inserted <= 0 {
		return fmt.Errorf("投入件数が0。admin_unit(pref 13) とタイルの取得を確認")
	}
	if res.Present <= 0 {
		return fmt.Errorf("present が0件（全て none）。タイルの SHICODE/PTN 抽出か上2桁=13 フィルタを確認")
	}

	// 上2桁が対象 1都3県 以外が紛れていないか（FK は実在を見るが pref は見ないため明示チェック）。
	var badPref int
	if err := tx.QueryRow(ctx,
		`SELECT count(*) FROM metric_value WHERE metric = $1 AND left(unit_id, 2) <> ALL($2)`,
		popChangeMetricKey, popChangePrefixes).Scan(&badPref); err != nil {
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
     OR (status = 'none'    AND value IS NOT NULL) )`, popChangeMetricKey).Scan(&badStatus); err != nil {
		return fmt.Errorf("status/value 整合チェックの集計に失敗: %w", err)
	}
	if badStatus != 0 {
		return fmt.Errorf("status と value が矛盾する行が %d 件ある", badStatus)
	}

	// present の率の値域。半世紀で人口が完全消滅(-100%=-1.0)以下や11倍超(>10.0)は算出バグの兆候。
	var minV, maxV float64
	if err := tx.QueryRow(ctx, `
SELECT min(value), max(value) FROM metric_value
WHERE metric = $1 AND status = 'present'`, popChangeMetricKey).Scan(&minV, &maxV); err != nil {
		return fmt.Errorf("率の値域集計に失敗: %w", err)
	}
	if minV <= -1.0 || maxV > 10.0 {
		return fmt.Errorf("増減率が現実的範囲外（min=%.4f max=%.4f）。ΣPTN/比の算出を確認", minV, maxV)
	}

	// サンプル＝中央区(13102)。偵察(部分タイル)と全タイル集計が一致した安定値ゆえ取り違え検出の基準にする
	// （千代田13101は全集計で+19.7%＝偵察の部分値+15%とずれ基準に不適）。許容±5ポイント＝年度差等を吸収しつつ取り違えは弾く。
	var sampleRate *float64
	var sampleStatus string
	err := tx.QueryRow(ctx,
		`SELECT value, status FROM metric_value WHERE metric = $1 AND unit_id = '13102'`,
		popChangeMetricKey).Scan(&sampleRate, &sampleStatus)
	switch {
	case err == pgx.ErrNoRows:
		// 13102 が admin_unit に無い（pref 13 未投入等）。件数・値域は通過済みゆえ警告に留めず成功扱い。
	case err != nil:
		return fmt.Errorf("サンプル(13102)の取得に失敗: %w", err)
	case sampleStatus == "present" && sampleRate != nil:
		const wantChuo = 0.247 // 中央区 2020→2050 の増減率（再開発で増・実データ全集計値）。
		if math.Abs(*sampleRate-wantChuo) > 0.05 {
			return fmt.Errorf("中央区(13102)の増減率が想定+24.7%%から乖離（実=%.3f）。集計ロジックを確認", *sampleRate)
		}
	}

	return nil
}
