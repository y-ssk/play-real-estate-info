#!/usr/bin/env bash
# fetch-xkt013.sh
#   国土数値情報 将来推計人口250mメッシュ(XKT013) を、東京本土を覆う z=11 タイル群でスイープ取得し、
#   配置規約 data/xkt013/{VINTAGE}/{PREF}/z11_{x}_{y}.geojson へ保存する（GeoJSON 応答）。
#
# 設計（fetch-n03.sh と同流儀・ADR-0024・backend-conventions §5.1）：
#   - self-source：鍵は環境変数 MLIT_API_KEY からヘッダで渡し、値を端末/履歴/ログに出さない（curl の
#     -H 引数に直接展開せず、curl が読む config を一時ファイル経由で渡す＝プロセス引数(ps)にも出さない）。
#   - レート制御：1タイルごとに待ちを入れ、連続で叩かない（XKT013 は1タイルが重い＝公式注記）。
#   - 冪等：同名で上書き保存（-o）＝何度流しても同結果。data/ は .gitignore。
#   - 取得と変換/集計を分ける継ぎ目：本スクリプトは「取得・保存」だけ。SHICODE 集計や重複排除は
#     後段の cmd/ingest（Go・ストリーム抽出）が担う（fetch は薄く保つ）。
#
# 範囲（本スライスの対象）：東京本土（23区＋多摩）を覆う z=11 グリッド x=[1814..1819] y=[804..807]＝24枚。
#   この矩形は緯度 35.46〜36.03N・経度 138.87〜139.92E を覆い、東京本土全域（≒35.5〜35.9N,
#   138.94〜139.92E）を margin 込みで包含する。タイルは隣県（埼玉/神奈川/千葉/山梨）にもはみ出すが、
#   集計段で SHICODE 上2桁='13' により東京都のみへ絞る（はみ出し分は捨てる）。
#   島嶼部（伊豆・小笠原）は本スライスの対象外＝データなし扱い（後続スライスで別グリッドを足す）。
#
# 引数: VINTAGE（既定 2050＝推計の到達年＝版管理用ラベル）。PREF は東京固定 13（範囲が東京本土ゆえ）。
# 例: scripts/fetch-xkt013.sh           # 既定 2050・東京
#     scripts/fetch-xkt013.sh 2050
#
# 配布元（IF定義 docs/api-if-spec/XKT013.md）：
#   https://www.reinfolib.mlit.go.jp/ex-api/external/XKT013?response_format=geojson&z=11&x=<x>&y=<y>
#   認証ヘッダ Ocp-Apim-Subscription-Key: <MLIT_API_KEY>
set -euo pipefail

VINTAGE="${1:-2050}"
PREF="13" # 東京本土固定（範囲が23区＋多摩ゆえ）。他県は範囲・グリッドを別途決めてから足す（憶測で広げない）。

# VINTAGE は4桁（版管理ラベル＝推計到達年）。憶測で別形式を受け取らない。
if ! printf '%s' "$VINTAGE" | grep -qE '^[0-9]{4}$'; then
  echo "VINTAGE は4桁（例 2050）: 受領=$VINTAGE" >&2
  exit 2
fi

# 鍵の存在のみ確認（値は出さない・CLAUDE.md 秘匿ルール）。未設定なら手順へ誘導して止める。
if [ -z "${MLIT_API_KEY:-}" ]; then
  echo "MLIT_API_KEY が未設定。~/.config/config.env を source する（README 参照）" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${REPO_ROOT}/data/xkt013/${VINTAGE}/${PREF}"
mkdir -p "$DEST_DIR"

# z=11 グリッド範囲（上のコメントの算出根拠どおり）。
Z=11
X_MIN=1814
X_MAX=1819
Y_MIN=804
Y_MAX=807

BASE_URL="https://www.reinfolib.mlit.go.jp/ex-api/external/XKT013"

# 鍵をプロセス引数(ps)に出さないため、curl の --config（-K）へヘッダ行を書いた一時ファイルを渡す。
# 一時ファイルは EXIT で必ず消す。中身（鍵）は端末に echo しない。
CURL_CFG="$(mktemp)"
trap 'rm -f "$CURL_CFG"' EXIT
{
  printf 'header = "Ocp-Apim-Subscription-Key: %s"\n' "$MLIT_API_KEY"
  printf 'fail\n'      # HTTP エラー(404等)を非ゼロ終了に（-f 相当）
  printf 'location\n' # リダイレクト追従（-L 相当）
  printf 'retry = 3\n'
} > "$CURL_CFG"

echo "fetch-xkt013: VINTAGE=${VINTAGE} PREF=${PREF} z=${Z} x=[${X_MIN}..${X_MAX}] y=[${Y_MIN}..${Y_MAX}]"
echo "  dest: ${DEST_DIR}"

count=0
for x in $(seq "$X_MIN" "$X_MAX"); do
  for y in $(seq "$Y_MIN" "$Y_MAX"); do
    out="${DEST_DIR}/z${Z}_${x}_${y}.geojson"
    url="${BASE_URL}?response_format=geojson&z=${Z}&x=${x}&y=${y}"
    echo "  tile z${Z}/${x}/${y} -> $(basename "$out")"
    # 鍵はヘッダ（--config 経由）。URL とファイル名のみ端末に出る（鍵は出ない）。
    if ! curl -sS --config "$CURL_CFG" -o "$out" "$url"; then
      echo "  ダウンロード失敗（z${Z}/${x}/${y}）。鍵・レート制限・URL を確認" >&2
      exit 1
    fi
    # 応答が GeoJSON FeatureCollection であることを軽く確認（鍵切れ等のエラー JSON を取り違えない）。
    if ! grep -q '"FeatureCollection"' "$out"; then
      echo "  応答が FeatureCollection でない（z${Z}/${x}/${y}）。鍵・レート制限・API 応答を確認" >&2
      exit 1
    fi
    count=$((count + 1))
    # レート制御：1タイルごとに小休止（連続で叩かない）。重いレスポンスゆえ控えめに。
    sleep 1
  done
done

echo "fetch-xkt013: 完了。取得=${count}枚 配置=${DEST_DIR}"
ls -1 "${DEST_DIR}"
