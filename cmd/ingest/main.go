// Command ingest は取り込みバッチの入口（手動側・docs/02 §1・§6）。
//
// 段1 の責務＝N03 正規化（本丸・層1検証対象。ADR-0024・backend-conventions §5.1）：
// 投入工程（scripts/ingest-n03.sh が ogr2ogr で生テーブル n03_raw を作る）の後段として、
// n03_raw から 5桁市区町村コード（N03_007）で束ね MultiPolygon へ集約し、年度固定・値域チェックを
// かけて admin_unit へ書き込む。投入ツールを替えても本処理は不変（継ぎ目・ADR-0015/0022）。
//
// 接続情報は POSTGRES_* 環境変数から組み立てる（backend-conventions §1・compose/Makefile と同一思想：
// 実値はリポジトリ外。パスワードは引数・ログに出さない）。実行はオーナーの対話シェル（ADR-0024 死守事項）。
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/y-ssk/machilens/internal/db"
	"github.com/y-ssk/machilens/internal/ingest"
	"github.com/y-ssk/machilens/internal/tilegrid"
)

func main() {
	// なぜフラグで year/pref を取るか：投入する版（年度）と対象都県を呼び出しごとに固定する
	// （年度は admin_unit の行には持たず「どの版を投入したか」の運用上の固定＝ADR-0024）。
	year := flag.Int("year", 0, "国土数値情報 N03 の年度（例: 2023）")
	pref := flag.String("pref", "", "対象都道府県コード（2桁・例: 13）")
	// -metric を指定すると指標投入モード（取得・鍵不要・DB 接続のみ）。N03 正規化とは別経路。
	// 対応指標：area_km2（admin_unit から算出）／pop_change_rate_2020_2050（XKT013 タイル群を集計・要 -data）。
	metric := flag.String("metric", "", "投入する指標キー（例: area_km2, pop_change_rate_2020_2050, aging_rate_2050, land_price_median, flood_area_coverage_rate）。指定時は指標投入モード（year/pref 不要）")
	// -data は指標がローカルのファイル群（取得済みタイル等）を読む場合の入力ディレクトリ。
	// area_km2 のような算出指標では不要。pop_change_rate_2020_2050 は data/xkt013/<vintage>、
	// land_price_median は data/xpt002/<year>（いずれも pref サブディレクトリを再帰探索）を指す。
	dataDir := flag.String("data", "", "指標が読む入力ディレクトリ（例: data/xkt013/2050, data/xpt002/2024）。ファイルを読む指標でのみ必要")
	// -tiles モード：対象 pref の bbox からタイル取得範囲（z x y）を1行ずつ出力する（fetch スクリプトが読む）。
	// タイル取得型指標（地価・人口・災害）のエリア・パラメータ化の継ぎ目（ADR-0030）。DB から ST_Extent を得る。
	tiles := flag.Bool("tiles", false, "タイル取得範囲を出力するモード（-pref と -z を伴う。fetch スクリプト用・ADR-0030）")
	z := flag.Int("z", 0, "タイル取得のズーム（-tiles モードで使用。XPT002 は 13〜15）")
	flag.Parse()

	// モード分岐：-tiles があればタイル範囲出力、-metric があれば指標投入、無ければ従来の N03 正規化。
	if *tiles {
		if err := runTiles(*pref, *z); err != nil {
			log.Fatalf("ingest: %v", err)
		}
		return
	}
	if *metric != "" {
		if err := runMetric(*metric, *dataDir); err != nil {
			log.Fatalf("ingest: %v", err)
		}
		return
	}

	if err := run(*year, *pref); err != nil {
		log.Fatalf("ingest: %v", err)
	}
}

// runMetric は指標投入モードの本体（取得・鍵不要・DB 接続のみ・ADR-0015 の「値の道」実証）。
//
// 面積（area_km2）は admin_unit の境界から算出する派生指標ゆえ MLIT API も鍵も不要で、
// metric_value→/values→setFeatureState→面塗りの継ぎ目を取得の不確実性なしに通すための指標。
func runMetric(metric, dataDir string) error {
	dsn, err := db.DSNFromEnv()
	if err != nil {
		return err
	}

	// 算出/集計は多くの指標で数秒〜数分だが、止まったら気づけるよう上限を置く（Ctrl-C でも中断可）。
	// 上限は 60 分：洪水(flood_area_coverage_rate)は交差面積按分の ST_Union が重く、1都3県で数十万〜
	// 百万のポリゴンを区ごとに結合するため、COPY(~15分)＋区ごと ST_Union の INSERT で 30 分を超える
	// （実測・GEOS 3.9・当初の 30 分上限は INSERT 途中で context deadline exceeded・#74）。60 分へ引き上げ、
	// 真にハングした場合だけ止める余裕を残す。他指標（面積/人口/地価）は数秒で終わるため無害（早い指標を妨げない）。
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 60*time.Minute)
	defer cancel()

	switch metric {
	case "area_km2":
		res, err := ingest.ComputeAreaKm2(ctx, dsn)
		if err != nil {
			return err
		}
		log.Printf("ingest: 指標投入完了 metric=%s 投入件数=%d 値域[min=%.3f max=%.3f]km²",
			res.Metric, res.Inserted, res.MinValue, res.MaxValue)
		return nil
	case "pop_change_rate_2020_2050":
		if dataDir == "" {
			return fmt.Errorf("-metric=pop_change_rate_2020_2050 は -data を要する（例: -data=data/xkt013/2050。先に scripts/fetch-xkt013.sh）")
		}
		res, err := ingest.ComputePopChangeRate(ctx, dsn, dataDir)
		if err != nil {
			return err
		}
		log.Printf("ingest: 指標投入完了 metric=%s 投入件数=%d (present=%d none=%d) 率[min=%.3f max=%.3f] メッシュ採用=%d 重複skip=%d 県外skip=%d",
			res.Metric, res.Inserted, res.Present, res.None, res.MinRate, res.MaxRate, res.MeshKept, res.DupSkipped, res.PrefSkipped)
		return nil
	case "aging_rate_2050":
		if dataDir == "" {
			return fmt.Errorf("-metric=aging_rate_2050 は -data を要する（例: -data=data/xkt013/2050。先に scripts/fetch-xkt013.sh）")
		}
		res, err := ingest.ComputeAgingRate(ctx, dsn, dataDir)
		if err != nil {
			return err
		}
		log.Printf("ingest: 指標投入完了 metric=%s 投入件数=%d (present=%d none=%d) 高齢化率[min=%.3f max=%.3f] メッシュ採用=%d 重複skip=%d 県外skip=%d",
			res.Metric, res.Inserted, res.Present, res.None, res.MinRate, res.MaxRate, res.MeshKept, res.DupSkipped, res.PrefSkipped)
		return nil
	case "land_price_median":
		if dataDir == "" {
			return fmt.Errorf("-metric=land_price_median は -data を要する（例: -data=data/xpt002/2024。先に scripts/fetch-xpt002.sh）")
		}
		// 取得対象年は -data 末尾のディレクトリ名（<year>）から取る（data/xpt002/2024 → 2024）。
		year, err := yearFromDataDir(dataDir)
		if err != nil {
			return err
		}
		res, err := ingest.ComputeLandPriceMedian(ctx, dsn, dataDir, year)
		if err != nil {
			return err
		}
		log.Printf("ingest: 指標投入完了 metric=%s year=%d 投入件数=%d (present=%d none=%d) 中央値[min=%.0f max=%.0f]円/㎡ 採用点=%d 重複skip=%d 非住宅skip=%d 価格不良skip=%d",
			res.Metric, year, res.Inserted, res.Present, res.None, res.MinYen, res.MaxYen, res.PointsParsed, res.DupSkipped, res.NonResiSkip, res.BadPriceSkip)
		return nil
	case "flood_area_coverage_rate":
		if dataDir == "" {
			return fmt.Errorf("-metric=flood_area_coverage_rate は -data を要する（例: -data=data/xkt026/2024。先に scripts/fetch-xkt026.sh）")
		}
		// 版年は -data 末尾のディレクトリ名（<year>）から取る（data/xkt026/2024 → 2024・取得物と投入年を一致）。
		year, err := yearFromDataDir(dataDir)
		if err != nil {
			return err
		}
		res, err := ingest.ComputeFloodAreaCoverage(ctx, dsn, dataDir, year)
		if err != nil {
			return err
		}
		log.Printf("ingest: 指標投入完了 metric=%s year=%d 投入件数=%d (present=%d none=%d) 該当面積率[min=%.2f max=%.2f]%% ポリゴン=%d",
			res.Metric, year, res.Inserted, res.Present, res.None, res.MinRate, res.MaxRate, res.PolygonsParsed)
		return nil
	default:
		return fmt.Errorf("未対応の -metric=%q（対応: area_km2, pop_change_rate_2020_2050, aging_rate_2050, land_price_median, flood_area_coverage_rate）", metric)
	}
}

// run は正規化の本体。失敗は握りつぶさず文脈付きで返す（ADR-0024 成果物3）。
func run(year int, pref string) error {
	if year <= 0 {
		return fmt.Errorf("-year は正の年度を指定する（例: -year=2023）")
	}
	if len(pref) != 2 {
		return fmt.Errorf("-pref は2桁の都道府県コードを指定する（例: -pref=13）: 受領=%q", pref)
	}

	dsn, err := db.DSNFromEnv()
	if err != nil {
		return err
	}

	// なぜ全体に締め切りを設けるか：ST_Union は東京都全域の図形を1つにまとめる処理で数十秒かかりうる本丸処理。
	// 無制限に待たず、止まったら気づける上限を置く（握りつぶさず即エラー）。Ctrl-C でも中断できる。
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	res, err := ingest.Normalize(ctx, dsn, year, pref)
	if err != nil {
		return err
	}

	log.Printf("ingest: 正規化完了 year=%d pref=%s 投入件数=%d サンプル(code=%s name=%q)",
		year, pref, res.Inserted, res.SampleCode, res.SampleName)
	return nil
}

// runTiles は対象 pref のタイル取得範囲を「z x y」1行ずつ標準出力へ書く（fetch スクリプトが読む）。
//
// bbox は tilegrid.PrefBBoxOverride に明示があればそれを、無ければ admin_unit の ST_Extent を使う
// （ADR-0030：ST_Extent または明示 bbox。東京は島嶼を除く本土 bbox を明示）。z は API 制約で呼び出し側が
// 渡す（XPT002 は 13〜15）。出力は行指向＝bash が while read で回して1タイルずつ取得できる（継ぎ目・ADR-0030）。
func runTiles(pref string, z int) error {
	if len(pref) != 2 {
		return fmt.Errorf("-pref は2桁の都道府県コードを指定する（例: -pref=13）: 受領=%q", pref)
	}
	if z <= 0 {
		return fmt.Errorf("-z はタイルのズームを指定する（XPT002 は 13〜15）: 受領=%d", z)
	}

	bbox, ok := tilegrid.PrefBBoxOverride[pref]
	if !ok {
		var err error
		bbox, err = prefBBoxFromDB(pref)
		if err != nil {
			return err
		}
	}
	r, err := tilegrid.RangeFor(bbox, z)
	if err != nil {
		return err
	}
	// 進捗・件数は stderr（fetch スクリプトのログ）へ。タイル座標は stdout（スクリプトが read で拾う）へ。
	fmt.Fprintf(os.Stderr, "tiles: pref=%s z=%d x=[%d..%d] y=[%d..%d] 枚数=%d\n",
		pref, r.Z, r.XMin, r.XMax, r.YMin, r.YMax, r.Count())
	for _, t := range r.Tiles() {
		fmt.Printf("%d %d %d\n", t.Z, t.X, t.Y)
	}
	return nil
}

// prefBBoxFromDB は admin_unit の該当 pref を ST_Extent で束ねて bbox を返す（明示 override が無い県用）。
func prefBBoxFromDB(pref string) (tilegrid.BBox, error) {
	dsn, err := db.DSNFromEnv()
	if err != nil {
		return tilegrid.BBox{}, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return tilegrid.BBox{}, fmt.Errorf("DB へ接続できない（POSTGRES_* と DB 起動を確認）: %w", err)
	}
	defer conn.Close(ctx)

	// ST_Extent の各辺を数値で取る（BOX 文字列のパースを避け SQL で分解）。pref は上2桁で絞る。
	var minLon, minLat, maxLon, maxLat float64
	err = conn.QueryRow(ctx, `
SELECT ST_XMin(e), ST_YMin(e), ST_XMax(e), ST_YMax(e)
FROM (SELECT ST_Extent(geom) AS e FROM admin_unit
      WHERE unit_kind='municipality' AND left(code,2)=$1) s`, pref).
		Scan(&minLon, &minLat, &maxLon, &maxLat)
	if err != nil {
		return tilegrid.BBox{}, fmt.Errorf("admin_unit(pref %s) の ST_Extent 取得に失敗（先に N03 投入か）: %w", pref, err)
	}
	return tilegrid.BBox{MinLon: minLon, MinLat: minLat, MaxLon: maxLon, MaxLat: maxLat}, nil
}

// yearFromDataDir は data/<dataset>/<year> の末尾ディレクトリ名から年（4桁）を取り出す。
//
// 取得年を -data パスの規約（配置規約 data/xpt002/<year>/<pref>/・data/xkt026/<year>/<pref>/ 等）から
// 一意に決める＝別フラグを増やさず取得物と投入年を食い違わせない（取得したファイルの年 = 投入する year）。
func yearFromDataDir(dataDir string) (int, error) {
	base := filepath.Base(filepath.Clean(dataDir))
	y, err := strconv.Atoi(base)
	if err != nil || y < 1995 || y > 2100 {
		return 0, fmt.Errorf("-data の末尾が年(4桁)でない（%q）。配置規約 data/<dataset>/<year> に合わせる", dataDir)
	}
	return y, nil
}
