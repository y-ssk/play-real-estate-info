package ingest

import (
	"encoding/json"
	"math"
	"strconv"
	"strings"
)

// XKT015 の properties は型が混在する（駅名=文字列・乗降客数=整数・コード=`"1.0"` 表記の文字列）。
// JSON の生値（RawMessage）を、フィールドの実態に合わせて安全に取り出すヘルパ群（憶測で1型に決め打ちしない）。

// jsonString は RawMessage を文字列として取り出す（JSON 文字列なら復号、それ以外は素のまま）。
//
// 駅名・運営会社・路線名は JSON 文字列。欠損（キー無し＝nil）や数値が来た場合も落とさず空/素表現を返す
// （集計キーに使うため取りこぼさない＝防御的）。
func jsonString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	// 文字列でない（数値等）場合は生のトークンをそのまま文字列化する。
	return strings.TrimSpace(string(raw))
}

// jsonInt は RawMessage を整数として取り出す（乗降客数 S12_057 用）。
//
// 整数 JSON（42962）を期待するが、欠損や `"40962"`/`"40962.0"` のような文字列表現にも耐える
// （取りこぼすと合計が過少になるため防御的にパース）。解釈不能なら0（=値なし扱い）。
func jsonInt(raw json.RawMessage) int {
	if len(raw) == 0 {
		return 0
	}
	// まず数値として。
	var n float64
	if err := json.Unmarshal(raw, &n); err == nil {
		return int(math.Round(n))
	}
	// 文字列表現（"40962" / "40962.0"）にも対応。
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if f, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
			return int(math.Round(f))
		}
	}
	return 0
}

// codeToInt はコード値（重複コード S12_054 等）を整数へ正規化する。
//
// XKT015 のコードは出力例で `"1.0"`（小数表記の文字列）／IF 表では `1`。`"1.0"`・`"1"`・`1`・`1.0` の
// いずれが来ても同じ整数（1）へ畳む＝重複コード=1 の抽出を表記ゆれに頑健にする（XKT015 IF §3 の要確認点）。
// 解釈不能・欠損は 0（=非アクティブ扱い＝合計に入れない）。
func codeToInt(raw json.RawMessage) int {
	if len(raw) == 0 {
		return 0
	}
	var n float64
	if err := json.Unmarshal(raw, &n); err == nil {
		return int(math.Round(n))
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if f, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
			return int(math.Round(f))
		}
	}
	return 0
}
