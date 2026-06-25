// Command ingest は取り込みバッチの入口（定期/手動側・docs/02 §1・§6）。
//
// 段0 時点では足場のみ（実取り込みは段1以降＝N03 境界投入・metric_value 集計）。
// ここでは「ビルド対象として存在し go build を壊さない」ことだけを担保する。
package main

import "log"

func main() {
	// 段1で：対象市区町村コードの設定リスト読み込み → N03 投入 → 5桁コード正規化 →
	// 値域/欠損3区別チェック（backend-conventions §5・ADR-0014/0015/0022）。
	log.Println("machilens ingest: 段0 足場。取り込み処理は段1以降に実装する。")
}
