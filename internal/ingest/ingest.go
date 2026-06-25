// Package ingest は N03 正規化（生テーブル n03_raw → admin_unit）の本丸処理を持つ。
//
// 設計（ADR-0024・backend-conventions §5.1）：投入（ogr2ogr が n03_raw を作る）と正規化を分ける継ぎ目。
// 本パッケージは正規化のみを担い、投入ツールに依存しない。SQL は固定形（実行時に形が変わらない）だが、
// 対象テーブル n03_raw は ogr2ogr が動的に作る一時テーブル（属性そのまま・大文字列名）でスキーマ管理外ゆえ、
// sqlc ではなく生SQL（pgx 直）で書く＝backend-conventions §1 例外3（sqlc が扱えない・理由をここに明記）。
// 投入件数・値域・幾何妥当性・文字化けは実行後アサートで層1（データの正しさ）を守る。
package ingest

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

// Result は正規化の結果サマリ（ログ・検証用）。
type Result struct {
	Inserted   int    // admin_unit へ投入した行数（>0 を期待）
	SampleCode string // 抜き取り検証に使った code（例 "13101"）
	SampleName string // その name（文字化けしていない日本語を期待）
}

// sampleCode は文字化け検証の抜き取り対象（千代田区）。pref=13 のとき存在する代表値。
// 他県では存在しないことがあるため、サンプル検証は「在れば確認」の扱いにする（下記参照）。
const sampleCode = "13101"

// Normalize は n03_raw から pref 単位で admin_unit を再構築する（冪等：DELETE→INSERT）。
//
// なぜ pref 単位の DELETE→INSERT か：9都県を順に流せるよう全消しにしない・何度流しても同結果にする
// （ETL 冪等性・ADR-0022/0024）。INSERT は N03_007（5桁）で GROUP BY し ST_Multi(ST_Union(geom)) で
// 飛び地・島嶼を1つの MultiPolygon に束ねる。表示名は N03_004（千代田区 等）をそのまま（政令市の区の
// 組み立ては9都県化で対応＝今回対象外・ADR-0024）。値域（上2桁=pref・5桁形式）は admin_unit の CHECK が
// 担保し、ここでも WHERE で弾く（取り違え二重防御）。
func Normalize(ctx context.Context, dsn string, year int, pref string) (Result, error) {
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		// dsn にはパスワードが含まれるため、エラーに dsn を載せない（端末/ログに漏らさない）。
		return Result{}, fmt.Errorf("DB へ接続できない（POSTGRES_* と DB 起動を確認）: %w", err)
	}
	defer conn.Close(ctx)

	if err := ensureRawTable(ctx, conn); err != nil {
		return Result{}, err
	}

	// 都県単位の入れ替えは1トランザクションで（DELETE 後 INSERT 失敗で空にしない＝原子性）。
	tx, err := conn.Begin(ctx)
	if err != nil {
		return Result{}, fmt.Errorf("トランザクション開始に失敗: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }() // commit 済みなら no-op

	// $1=pref。値は必ず引数化（文字列連結しない＝backend-conventions §1.3）。
	if _, err := tx.Exec(ctx, `DELETE FROM admin_unit WHERE pref_code = $1`, pref); err != nil {
		return Result{}, fmt.Errorf("既存 admin_unit(pref=%s) の削除に失敗: %w", pref, err)
	}

	// N03_007（5桁文字列）で束ねる。name は同一コード内で同じ想定だが、ディゾルブの集約に合わせ max() を取る。
	// left("N03_007",2)=pref で対象県のみ・"N03_007" ~ '^[0-9]{5}$' で非数値/欠損行を除外（値域・欠損対処）。
	const insertSQL = `
INSERT INTO admin_unit (code, unit_kind, name, pref_code, geom)
SELECT "N03_007",
       'municipality',
       max("N03_004"),
       left("N03_007", 2),
       ST_Multi(ST_Union(geom))
FROM n03_raw
WHERE left("N03_007", 2) = $1
  AND "N03_007" ~ '^[0-9]{5}$'
GROUP BY "N03_007"`
	tag, err := tx.Exec(ctx, insertSQL, pref)
	if err != nil {
		return Result{}, fmt.Errorf("admin_unit への正規化 INSERT に失敗（n03_raw の投入と列名 N03_007/N03_004 を確認）: %w", err)
	}
	inserted := int(tag.RowsAffected())

	res, err := assert(ctx, tx, pref, inserted)
	if err != nil {
		// アサート失敗はロールバック（defer）＝壊れたデータを残さない。
		return Result{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Result{}, fmt.Errorf("コミットに失敗: %w", err)
	}
	return res, nil
}

// ensureRawTable は n03_raw の存在を先に確かめ、未投入なら分かりやすく落とす。
//
// なぜ別途確認するか：未投入だと INSERT が "relation does not exist" になり原因が伝わりにくい。
// 「先に scripts/ingest-n03.sh を流す」と気づけるメッセージにする（手順の取り違え対策）。
func ensureRawTable(ctx context.Context, conn *pgx.Conn) error {
	var exists bool
	if err := conn.QueryRow(ctx, `SELECT to_regclass('public.n03_raw') IS NOT NULL`).Scan(&exists); err != nil {
		return fmt.Errorf("n03_raw の存在確認に失敗: %w", err)
	}
	if !exists {
		return errors.New("n03_raw が無い。先に scripts/ingest-n03.sh（make ingest-n03）で GeoJSON を投入する")
	}
	return nil
}

// assert は実行後アサート（ADR-0024 成果物3・層1検証）。失敗は具体的な値付きで返す。
//
// 検証項目：(1) 投入件数>0 (2) 全 code が5桁数字 (3) 全 geom が ST_IsValid
// (4) サンプル名（あれば）が文字化けしていない日本語。pref 内に閉じて数える（他県を巻き込まない）。
func assert(ctx context.Context, tx pgx.Tx, pref string, inserted int) (Result, error) {
	if inserted <= 0 {
		return Result{}, fmt.Errorf("投入件数が0（pref=%s）。n03_raw に対象データがあるか・N03_007 の値を確認", pref)
	}

	// 5桁形式違反の件数（admin_unit の CHECK があるため通常0だが、念のため明示的に数えて層1を可視化）。
	var badCode int
	if err := tx.QueryRow(ctx,
		`SELECT count(*) FROM admin_unit WHERE pref_code = $1 AND code !~ '^[0-9]{5}$'`, pref,
	).Scan(&badCode); err != nil {
		return Result{}, fmt.Errorf("code 形式チェックの集計に失敗: %w", err)
	}
	if badCode != 0 {
		return Result{}, fmt.Errorf("5桁でない code が %d 件ある（pref=%s）", badCode, pref)
	}

	// 不正な幾何（自己交差等）の件数。NULL geom も不正扱い（境界は必ず geom を持つべき）。
	var badGeom int
	if err := tx.QueryRow(ctx,
		`SELECT count(*) FROM admin_unit WHERE pref_code = $1 AND (geom IS NULL OR NOT ST_IsValid(geom))`, pref,
	).Scan(&badGeom); err != nil {
		return Result{}, fmt.Errorf("ST_IsValid チェックの集計に失敗: %w", err)
	}
	if badGeom != 0 {
		return Result{}, fmt.Errorf("不正な geom が %d 件ある（pref=%s・ST_IsValid=false か NULL）", badGeom, pref)
	}

	// サンプル名の文字化け確認。サンプルは pref に依存する代表値（13101=千代田区）。
	// 当該 code が無い県もあるため「在れば検証」。在るのに ASCII/制御文字混じり等で日本語に見えなければ失敗。
	res := Result{Inserted: inserted}
	var name string
	err := tx.QueryRow(ctx,
		`SELECT name FROM admin_unit WHERE code = $1`, sampleCode,
	).Scan(&name)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		// 対象県にサンプル code が無い（pref!=13 等）。件数・値域・幾何は通過済みゆえ成功扱い。
		res.SampleCode = ""
		res.SampleName = ""
	case err != nil:
		return Result{}, fmt.Errorf("サンプル名の取得に失敗: %w", err)
	default:
		if !looksJapanese(name) {
			return Result{}, fmt.Errorf("サンプル名が文字化けの疑い（code=%s name=%q）。投入時の文字コード（GeoJSON は UTF-8）を確認", sampleCode, name)
		}
		res.SampleCode = sampleCode
		res.SampleName = name
	}
	return res, nil
}

// looksJapanese は文字列に日本語（CJK 統合漢字・ひらがな・カタカナ）が1文字以上含まれるかを返す。
//
// なぜこの判定か：CP932 を取り違えた投入では市区町村名が ASCII の化け文字や別言語の記号列になる。
// 「日本語の文字が1つも無い」を文字化けの兆候として弾く（完全な正しさ判定ではなく層1のスモークテスト）。
func looksJapanese(s string) bool {
	for _, r := range s {
		switch {
		case r >= 0x3040 && r <= 0x309F: // ひらがな
			return true
		case r >= 0x30A0 && r <= 0x30FF: // カタカナ
			return true
		case r >= 0x4E00 && r <= 0x9FFF: // CJK 統合漢字
			return true
		}
	}
	return false
}

// DSNFromEnv は POSTGRES_* から接続文字列を組み立てる（compose/Makefile と同一変数・backend-conventions §1）。
//
// なぜ環境変数からか：実値（特にパスワード）をリポジトリに置かない（config.env→環境変数の一本道）。
// 未設定は即エラーにし握りつぶさない（compose の ${VAR:?} と同じ思想）。返す DSN にパスワードが入るため、
// 呼び出し側は DSN をログ・エラーに載せないこと。
func DSNFromEnv() (string, error) {
	user := os.Getenv("POSTGRES_USER")
	pass := os.Getenv("POSTGRES_PASSWORD")
	db := os.Getenv("POSTGRES_DB")
	if user == "" || pass == "" || db == "" {
		return "", errors.New("POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB が未設定（~/.config/config.env を source する・README 参照）")
	}
	port := os.Getenv("POSTGRES_PORT")
	if port == "" {
		port = "5432"
	}
	host := os.Getenv("POSTGRES_HOST")
	if host == "" {
		// migrate と同じく host の localhost:PORT（compose が publish）。オーナーの対話シェルから実行する前提。
		host = "localhost"
	}
	// pgx は key=value DSN を解釈する。パスワードに記号が入っても URL エンコード不要なこの形を使う。
	return fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		host, port, user, pass, db), nil
}
