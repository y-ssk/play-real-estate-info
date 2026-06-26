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
	"time"

	"github.com/y-ssk/machilens/internal/db"
	"github.com/y-ssk/machilens/internal/ingest"
)

func main() {
	// なぜフラグで year/pref を取るか：投入する版（年度）と対象都県を呼び出しごとに固定する
	// （年度は admin_unit の行には持たず「どの版を投入したか」の運用上の固定＝ADR-0024）。
	year := flag.Int("year", 0, "国土数値情報 N03 の年度（例: 2023）")
	pref := flag.String("pref", "", "対象都道府県コード（2桁・例: 13）")
	// -metric を指定すると指標投入モード（取得・鍵不要・DB 接続のみ）。N03 正規化とは別経路。
	// 現状の対応指標は area_km2（市区町村面積・admin_unit から算出）のみ。
	metric := flag.String("metric", "", "投入する指標キー（例: area_km2）。指定時は指標投入モード（year/pref 不要）")
	flag.Parse()

	// モード分岐：-metric があれば指標投入（鍵不要・全単位一括）、無ければ従来の N03 正規化。
	if *metric != "" {
		if err := runMetric(*metric); err != nil {
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
func runMetric(metric string) error {
	dsn, err := db.DSNFromEnv()
	if err != nil {
		return err
	}

	// 算出は ST_Area の集計で数百件ゆえ短時間だが、止まったら気づけるよう上限を置く（Ctrl-C でも中断可）。
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
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
	default:
		return fmt.Errorf("未対応の -metric=%q（対応: area_km2）", metric)
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
