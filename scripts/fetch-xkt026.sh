#!/usr/bin/env bash
# fetch-xkt026.sh [YEAR]
#   国土数値情報 洪水浸水想定区域（想定最大規模）(XKT026) を、対象エリア（1都3県＝13/11/12/14）を覆う
#   z=14 タイル群でスイープ取得し、配置規約 data/xkt026/{YEAR}/{PREF}/z14_{x}_{y}.geojson へ保存する（GeoJSON 応答）。
#
# 設計（fetch-xkt013.sh / fetch-xpt002.sh と同流儀・ADR-0024・ADR-0030・backend-conventions §5.1）：
#   - self-source：鍵は環境変数 MLIT_API_KEY からヘッダで渡し、値を端末/履歴/ログに出さない
#     （curl --config の一時ファイル経由＝プロセス引数(ps)にも出さない）。~/.config/config.env は
#     中身を見ず source するだけ（AI 不可触・CLAUDE.md 秘匿ルール）。
#   - タイル範囲は決め打ちせず go 側で bbox→タイル範囲を算出（ADR-0030 継ぎ目b＝タイル取得型指標の
#     エリア・パラメータ化）。`go run ./cmd/ingest -tiles -pref=<PREF> -z=14` が「z x y」を1行ずつ吐く
#     （東京は本土 bbox・他県は admin_unit の ST_Extent。tilegrid.PrefBBoxOverride / RangeFor が単一の真実＝
#     地価 XPT002・人口 XKT013 と同じ計算を共有する）。
#   - レート制御：1タイルごとに待ちを入れ、連続で叩かない。XKT026 は z=14〜15 のみ配布＝低ズームで粗く取る
#     逃げ道が無く、1都3県で z=14 は約 6960 枚と重い（設計 note §8）。控えめに叩く。
#   - 冪等：同名で上書き保存（-o）＝何度流しても同結果。data/ は .gitignore。空タイル（浸水域なし）は
#     保存しても集計に無害だが、枚数が多くディスクを食うため features 空なら消す（xpt002 と同方針）。
#   - 取得と集計を分ける継ぎ目：本スクリプトは取得・保存だけ。交差面積按分（結合→交差→面積÷区面積×100）・
#     データなし判定は後段の cmd/ingest -metric=flood_area_coverage_rate（Go・PostGIS）が担う（fetch は薄く保つ）。
#
# 引数: YEAR（既定 2024＝XKT026 の版年ラベル。配置 data/xkt026/{YEAR}/ と投入 year に一致させる）。
# 例: scripts/fetch-xkt026.sh          # 既定 2024・1都3県（約6960枚・約1時間）
#     scripts/fetch-xkt026.sh 2024
#     PREFS_OVERRIDE="13" scripts/fetch-xkt026.sh 2024   # 東京のみ（層1を少数で先に固める）
#
# 配布元（IF定義 docs/api-if-spec/XKT026.md）：
#   https://www.reinfolib.mlit.go.jp/ex-api/external/XKT026?response_format=geojson&z=14&x=<x>&y=<y>
#   認証ヘッダ Ocp-Apim-Subscription-Key: <MLIT_API_KEY>
set -euo pipefail

YEAR="${1:-2024}"

# YEAR は4桁（版年ラベル）。憶測で別形式を受け取らない。
if ! printf '%s' "$YEAR" | grep -qE '^[0-9]{4}$'; then
  echo "YEAR は4桁（例 2024）: 受領=$YEAR" >&2
  exit 2
fi

# 対象エリア（1都3県・ADR-0030 波1）。他エリアは波でこのリストへ足す（掛け算を避ける・コードは触らない）。
# 取得が重いため、PREFS_OVERRIDE で pref を絞れる（例: 東京のみで層1を先に固める→1都3県へ広げる）。
if [ -n "${PREFS_OVERRIDE:-}" ]; then
  # 空白区切りで受ける（例: "13" または "13 11"）。
  read -r -a PREFS <<< "$PREFS_OVERRIDE"
else
  PREFS=("13" "11" "12" "14")
fi
Z=14 # XKT026 は z=14〜15 のみ。最小 z=14 で全域を網羅（tilegrid.XKT026TileZoom と一致・area.go 参照）。

# 秘匿は中身を見ず source するだけ（MLIT_API_KEY・POSTGRES_* を環境変数に載せる。POSTGRES_* は
# go の -tiles が admin_unit の ST_Extent を引くのに要る＝1都3県が投入済みであること）。
# shellcheck disable=SC1090
[ -f ~/.config/config.env ] && source ~/.config/config.env

# 鍵の存在のみ確認（値は出さない・CLAUDE.md 秘匿ルール）。未設定なら手順へ誘導して止める。
if [ -z "${MLIT_API_KEY:-}" ]; then
  echo "MLIT_API_KEY が未設定。~/.config/config.env を確認する（README 参照）" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="https://www.reinfolib.mlit.go.jp/ex-api/external/XKT026"

# タイル範囲算出用の ingest バイナリを1度だけビルドし使い回す（毎タイルで go run を起動しない）。
# go はモジュールルート（REPO_ROOT）を作業ディレクトリに要するため -C で固定する。
INGEST_BIN="$(mktemp)"
trap 'rm -f "$CURL_CFG" "$INGEST_BIN"' EXIT
if ! go -C "$REPO_ROOT" build -o "$INGEST_BIN" ./cmd/ingest; then
  echo "ingest のビルドに失敗。Go 環境を確認" >&2
  exit 1
fi

# 鍵をプロセス引数(ps)に出さないため、curl の --config（-K）へヘッダ行を書いた一時ファイルを渡す。
# 一時ファイルは EXIT で必ず消す。中身（鍵）は端末に echo しない。
CURL_CFG="$(mktemp)"
{
  printf 'header = "Ocp-Apim-Subscription-Key: %s"\n' "$MLIT_API_KEY"
  printf 'fail\n'         # HTTP エラー(404等)を非ゼロ終了に（-f 相当）
  printf 'location\n'     # リダイレクト追従（-L 相当）
  printf 'http1.1\n'      # HTTP/1.1 を強制：サーバの HTTP/2 実装が長時間スイープで
                          # "HTTP/2 stream not closed cleanly: PROTOCOL_ERROR" を出す（実測・約6960枚の途中で頻発）。
  printf 'retry = 5\n'    # 一時失敗の再試行（レート制限・切断）。
  printf 'retry-all-errors\n' # PROTOCOL_ERROR 等 HTTP 以外の転送エラーも再試行対象に含める。
  printf 'retry-delay = 2\n'  # 再試行間隔（秒）。
} > "$CURL_CFG"

echo "fetch-xkt026: YEAR=${YEAR} PREFS=${PREFS[*]} z=${Z}"

total=0
empty=0
for PREF in "${PREFS[@]}"; do
  DEST_DIR="${REPO_ROOT}/data/xkt026/${YEAR}/${PREF}"
  mkdir -p "$DEST_DIR"
  echo "  pref=${PREF} dest=${DEST_DIR}"

  # タイル範囲を go から取得（bbox→z/x/y。単一の真実＝tilegrid）。stdout に「z x y」1行ずつ。
  # cd せず -C で作業ディレクトリを固定（go module ルート）。POSTGRES_* は source 済み（ST_Extent 用）。
  while read -r tz tx ty; do
    [ -z "$tz" ] && continue
    out="${DEST_DIR}/z${tz}_${tx}_${ty}.geojson"
    url="${BASE_URL}?response_format=geojson&z=${tz}&x=${tx}&y=${ty}"
    # 鍵はヘッダ（--config 経由）。URL とファイル名のみ端末に出る（鍵は出ない）。
    if ! curl -sS --config "$CURL_CFG" -o "$out" "$url"; then
      echo "  ダウンロード失敗（z${tz}/${tx}/${ty}）。鍵・レート制限・URL を確認" >&2
      exit 1
    fi
    # 応答が GeoJSON FeatureCollection か軽く確認（鍵切れ等のエラー JSON を取り違えない）。
    if ! grep -q '"FeatureCollection"' "$out"; then
      echo "  応答が FeatureCollection でない（z${tz}/${tx}/${ty}）。鍵・レート制限・API 応答を確認" >&2
      exit 1
    fi
    # 空タイル（浸水域が無い）は保存しても集計に無害だが、枚数が多くディスクを食うため features 空なら消す。
    # XKT026 は整形（複数行）JSON で features:[] が改行を跨ぐため、xpt002 の1行 grep では検出できない
    # （検証で確認）。整形に依らず「Feature オブジェクトが1つも無い＝空」を判定する（"type": "Feature" の有無）。
    if ! grep -q '"type": *"Feature"' "$out"; then
      rm -f "$out"
      empty=$((empty + 1))
    else
      total=$((total + 1))
    fi
    # レート制御：1タイルごとに小休止（連続で叩かない）。枚数が多いため控えめに。
    sleep 0.5
  done < <("$INGEST_BIN" -tiles -pref="$PREF" -z="$Z")
done

echo "fetch-xkt026: 完了。保存=${total}枚（浸水域あり） 空タイル=${empty}枚 配置=data/xkt026/${YEAR}/"
