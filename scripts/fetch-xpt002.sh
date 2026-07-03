#!/usr/bin/env bash
# fetch-xpt002.sh [YEAR]
#   地価公示・地価調査のポイント(XPT002) を、対象エリア（1都3県＝13/11/12/14）を覆う z=13 タイル群で
#   スイープ取得し、配置規約 data/xpt002/{YEAR}/{PREF}/z13_{x}_{y}.geojson へ保存する（GeoJSON 応答）。
#
# 設計（fetch-xkt013.sh と同流儀・ADR-0024・ADR-0030・backend-conventions §5.1）：
#   - self-source：鍵は環境変数 MLIT_API_KEY からヘッダで渡し、値を端末/履歴/ログに出さない
#     （curl --config の一時ファイル経由＝プロセス引数(ps)にも出さない）。~/.config/config.env は
#     中身を見ず source するだけ（AI 不可触・CLAUDE.md 秘匿ルール）。
#   - タイル範囲は決め打ちせず go 側で bbox→タイル範囲を算出（ADR-0030 継ぎ目b・地価専用にしない汎用形）。
#     `go run ./cmd/ingest -tiles -pref=<PREF> -z=13` が「z x y」を1行ずつ吐く（東京は本土 bbox・
#     他県は admin_unit の ST_Extent を使う。tilegrid.PrefBBoxOverride / RangeFor が単一の真実）。
#   - 住宅地に絞って取得（useCategoryCode=00・IF §2）＝色分けは住宅地1本（ADR-0008）。国交省地価公示に
#     加え都道府県地価調査も拾う（priceClassification 未指定＝両方。点を増やし中央値を安定させる）。
#   - レート制御：1タイルごとに小休止（連続で叩かない）。1都3県で z=13 は 2000 枚規模ゆえ控えめに。
#   - 冪等：同名で上書き保存（-o）＝何度流しても同結果。data/ は .gitignore。
#   - 取得と集計を分ける継ぎ目：本スクリプトは取得・保存だけ。空間結合(点:内包)・中央値・データなし判定は
#     後段の cmd/ingest -metric=land_price_median（Go・PostGIS）が担う（fetch は薄く保つ）。
#
# 引数: YEAR（既定 2024＝XPT002 の対象年。IF §2：1995〜最新）。
# 例: scripts/fetch-xpt002.sh          # 既定 2024・1都3県
#     scripts/fetch-xpt002.sh 2024
set -euo pipefail

YEAR="${1:-2024}"

# YEAR は4桁（取得対象年）。憶測で別形式を受け取らない。
if ! printf '%s' "$YEAR" | grep -qE '^[0-9]{4}$'; then
  echo "YEAR は4桁（例 2024）: 受領=$YEAR" >&2
  exit 2
fi

# 対象エリア（1都3県・ADR-0030 波1）。他エリアは波でこのリストへ足す（掛け算を避ける・コードは触らない）。
PREFS=("13" "11" "12" "14")
Z=13 # XPT002 は z=13〜15。点が疎ゆえ最小 z=13（tilegrid.XPT002TileZoom と一致・area.go 参照）。

# 秘匿は中身を見ず source するだけ（MLIT_API_KEY・POSTGRES_* を環境変数に載せる。POSTGRES_* は
# go の -tiles が admin_unit の ST_Extent を引くのに要る＝1都3県が投入済みであること）。
# shellcheck disable=SC1090
[ -f ~/.config/config.env ] && source ~/.config/config.env

# 鍵の存在のみ確認（値は出さない・CLAUDE.md 秘匿ルール）。
if [ -z "${MLIT_API_KEY:-}" ]; then
  echo "MLIT_API_KEY が未設定。~/.config/config.env を確認する（README 参照）" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002"

# タイル範囲算出用の ingest バイナリを1度だけビルドし使い回す（毎タイルで go run を起動しない）。
# go はモジュールルート（REPO_ROOT）を作業ディレクトリに要するため -C で固定する。
INGEST_BIN="$(mktemp)"
trap 'rm -f "$CURL_CFG" "$INGEST_BIN"' EXIT
if ! go -C "$REPO_ROOT" build -o "$INGEST_BIN" ./cmd/ingest; then
  echo "ingest のビルドに失敗。Go 環境を確認" >&2
  exit 1
fi

# 鍵をプロセス引数(ps)に出さないため、curl の --config へヘッダ行を書いた一時ファイルを渡す（fetch-xkt013 と同方式）。
CURL_CFG="$(mktemp)"
{
  printf 'header = "Ocp-Apim-Subscription-Key: %s"\n' "$MLIT_API_KEY"
  printf 'fail\n'     # HTTP エラー(404等)を非ゼロ終了に（-f 相当）
  printf 'location\n' # リダイレクト追従（-L 相当）
  printf 'retry = 3\n'
} > "$CURL_CFG"

echo "fetch-xpt002: YEAR=${YEAR} PREFS=${PREFS[*]} z=${Z}"

total=0
empty=0
for PREF in "${PREFS[@]}"; do
  DEST_DIR="${REPO_ROOT}/data/xpt002/${YEAR}/${PREF}"
  mkdir -p "$DEST_DIR"
  echo "  pref=${PREF} dest=${DEST_DIR}"

  # タイル範囲を go から取得（bbox→z/x/y。単一の真実＝tilegrid）。stdout に「z x y」1行ずつ。
  # cd せず -C で作業ディレクトリを固定（go module ルート）。POSTGRES_* は source 済み（ST_Extent 用）。
  while read -r tz tx ty; do
    [ -z "$tz" ] && continue
    out="${DEST_DIR}/z${tz}_${tx}_${ty}.geojson"
    url="${BASE_URL}?response_format=geojson&z=${tz}&x=${tx}&y=${ty}&year=${YEAR}&useCategoryCode=00"
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
    # 空タイル（地価点が無い）は保存しても集計に無害だが、ディスク節約のため features 空なら消す。
    if grep -q '"features": *\[\] *}' "$out" || grep -q '"features":\[\]}' "$out"; then
      rm -f "$out"
      empty=$((empty + 1))
    else
      total=$((total + 1))
    fi
    # レート制御：1タイルごとに小休止（連続で叩かない）。
    sleep 0.3
  done < <("$INGEST_BIN" -tiles -pref="$PREF" -z="$Z")
done

echo "fetch-xpt002: 完了。保存=${total}枚（地価点あり） 空タイル=${empty}枚 配置=data/xpt002/${YEAR}/"
