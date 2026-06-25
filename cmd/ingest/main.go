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

	"github.com/y-ssk/machilens/internal/ingest"
)

func main() {
	// なぜフラグで year/pref を取るか：投入する版（年度）と対象都県を呼び出しごとに固定する
	// （年度は admin_unit の行には持たず「どの版を投入したか」の運用上の固定＝ADR-0024）。
	year := flag.Int("year", 0, "国土数値情報 N03 の年度（例: 2023）")
	pref := flag.String("pref", "", "対象都道府県コード（2桁・例: 13）")
	flag.Parse()

	if err := run(*year, *pref); err != nil {
		log.Fatalf("ingest: %v", err)
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

	dsn, err := ingest.DSNFromEnv()
	if err != nil {
		return err
	}

	// なぜ全体に締め切りを設けるか：ST_Union は東京都全域のディゾルブで数十秒かかりうる本丸処理。
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
