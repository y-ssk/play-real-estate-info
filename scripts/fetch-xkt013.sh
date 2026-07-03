#!/usr/bin/env bash
# fetch-xkt013.sh [VINTAGE]
#   国土数値情報 将来推計人口250mメッシュ(XKT013) を、対象エリア（1都3県＝13/11/12/14）を覆う z=11
#   タイル群でスイープ取得し、配置規約 data/xkt013/{VINTAGE}/{PREF}/z11_{x}_{y}.geojson へ保存する（GeoJSON 応答）。
#
# 設計（fetch-xpt002.sh と同流儀・ADR-0024・ADR-0030・backend-conventions §5.1）：
#   - self-source：鍵は環境変数 MLIT_API_KEY からヘッダで渡し、値を端末/履歴/ログに出さない
#     （curl --config の一時ファイル経由＝プロセス引数(ps)にも出さない）。~/.config/config.env は
#     中身を見ず source するだけ（AI 不可触・CLAUDE.md 秘匿ルール）。
#   - タイル範囲は決め打ちせず go 側で bbox→タイル範囲を算出（ADR-0030 継ぎ目b＝タイル取得型指標の
#     エリア・パラメータ化。人口専用にしない汎用形）。`go run ./cmd/ingest -tiles -pref=<PREF> -z=11` が
#     「z x y」を1行ずつ吐く（東京は本土 bbox・他県は admin_unit の ST_Extent を使う。tilegrid.
#     PrefBBoxOverride / RangeFor が単一の真実＝地価 XPT002 と同じ計算を共有する）。従来はここで東京
#     グリッドを決め打ちしていたが、エリアを波（1都3県→…）で広げるたびに手で書くのは掛け算の温床。
#   - レート制御：1タイルごとに待ちを入れ、連続で叩かない（XKT013 は1タイルが重い＝公式注記・1タイル ~29MB）。
#   - 冪等：同名で上書き保存（-o）＝何度流しても同結果。data/ は .gitignore。
#   - 取得と変換/集計を分ける継ぎ目：本スクリプトは「取得・保存」だけ。SHICODE 集計や重複排除は
#     後段の cmd/ingest（Go・ストリーム抽出）が担う（fetch は薄く保つ）。
#
# 東京の島嶼（伊豆・小笠原）について：東京は tilegrid.PrefBBoxOverride で本土 bbox に限定するため、
#   ST_Extent の島嶼まで含めた巨大矩形（→タイル爆発）を避ける。島嶼は面塗り MVP の対象外＝データなし扱い
#   （後続スライスで別グリッドを足すなら area.go の設定を編集するだけで済む＝本スクリプトは触らない）。
#
# 引数: VINTAGE（既定 2050＝推計の到達年＝版管理用ラベル）。
# 例: scripts/fetch-xkt013.sh          # 既定 2050・1都3県
#     scripts/fetch-xkt013.sh 2050
#
# 配布元（IF定義 docs/api-if-spec/XKT013.md）：
#   https://www.reinfolib.mlit.go.jp/ex-api/external/XKT013?response_format=geojson&z=11&x=<x>&y=<y>
#   認証ヘッダ Ocp-Apim-Subscription-Key: <MLIT_API_KEY>
set -euo pipefail

VINTAGE="${1:-2050}"

# VINTAGE は4桁（版管理ラベル＝推計到達年）。憶測で別形式を受け取らない。
if ! printf '%s' "$VINTAGE" | grep -qE '^[0-9]{4}$'; then
  echo "VINTAGE は4桁（例 2050）: 受領=$VINTAGE" >&2
  exit 2
fi

# 対象エリア（1都3県・ADR-0030 波1）。他エリアは波でこのリストへ足す（掛け算を避ける・コードは触らない）。
PREFS=("13" "11" "12" "14")
Z=11 # XKT013 は z=11〜15。市区町村集計ゆえ最小 z=11（IF §2「11（市）」）＝タイル枚数を抑える。

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
BASE_URL="https://www.reinfolib.mlit.go.jp/ex-api/external/XKT013"

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
  printf 'fail\n'     # HTTP エラー(404等)を非ゼロ終了に（-f 相当）
  printf 'location\n' # リダイレクト追従（-L 相当）
  printf 'retry = 3\n'
} > "$CURL_CFG"

echo "fetch-xkt013: VINTAGE=${VINTAGE} PREFS=${PREFS[*]} z=${Z}"

total=0
for PREF in "${PREFS[@]}"; do
  DEST_DIR="${REPO_ROOT}/data/xkt013/${VINTAGE}/${PREF}"
  mkdir -p "$DEST_DIR"
  echo "  pref=${PREF} dest=${DEST_DIR}"

  # タイル範囲を go から取得（bbox→z/x/y。単一の真実＝tilegrid）。stdout に「z x y」1行ずつ。
  # cd せず -C で作業ディレクトリを固定（go module ルート）。POSTGRES_* は source 済み（ST_Extent 用）。
  while read -r tz tx ty; do
    [ -z "$tz" ] && continue
    out="${DEST_DIR}/z${tz}_${tx}_${ty}.geojson"
    url="${BASE_URL}?response_format=geojson&z=${tz}&x=${tx}&y=${ty}"
    echo "  tile z${tz}/${tx}/${ty} -> $(basename "$out")"
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
    total=$((total + 1))
    # レート制御：1タイルごとに小休止（連続で叩かない）。重いレスポンスゆえ控えめに。
    sleep 1
  done < <("$INGEST_BIN" -tiles -pref="$PREF" -z="$Z")
done

echo "fetch-xkt013: 完了。取得=${total}枚 配置=data/xkt013/${VINTAGE}/"
