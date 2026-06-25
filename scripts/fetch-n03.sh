#!/usr/bin/env bash
# fetch-n03.sh YEAR PREF
#   国土数値情報 行政区域データ(N03) を直リンクで取得→解凍し、配置規約 data/n03/{YEAR}/{PREF}/ へ展開する。
#
# 設計（ADR-0024・backend-conventions §5.1）：取得は年1回・低頻度ゆえ完全自動化せず、直リンクの取得
# スクリプトで半自動。配置規約に一本化（temp/ は使わない＝誰がやっても同じ場所・構造）。data/ は .gitignore。
#
# 例: scripts/fetch-n03.sh 2023 13   # 令和5年版・東京都
#
# 配布元（実在確認済み 2026-06-25）：
#   ページ  https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2023.html
#   直リンク https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-{YEAR}/N03-{YEAR}0101_{PREF}_GML.zip
#   （2023 東京: .../N03-2023/N03-20230101_13_GML.zip を HEAD=200 application/zip で確認）
# zip 内のファイル基底名はダウンロード名と異なる（例 N03-23_13_230101.geojson）。
# ゆえに展開後は固定名を決め打ちせず *.geojson を glob で探す。
set -euo pipefail

YEAR="${1:-}"
PREF="${2:-}"
if [ -z "$YEAR" ] || [ -z "$PREF" ]; then
  echo "usage: $0 YEAR PREF   (例: $0 2023 13)" >&2
  exit 2
fi
# PREF は2桁ゼロ詰め（例 13・01）。年度は4桁。憶測で別形式を受け取らない。
if ! printf '%s' "$PREF" | grep -qE '^[0-9]{2}$'; then
  echo "PREF は2桁の都道府県コード（例 13）: 受領=$PREF" >&2
  exit 2
fi
if ! printf '%s' "$YEAR" | grep -qE '^[0-9]{4}$'; then
  echo "YEAR は4桁の年度（例 2023）: 受領=$YEAR" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${REPO_ROOT}/data/n03/${YEAR}/${PREF}"

# 直リンク URL（上記パターン）。配布日付は各年版とも MMDD=0101 固定（2023 で確認）。
# 別年版で 0101 以外なら 404 になるので、その場合は配布ページで実在 URL を確認すること（憶測で書き換えない）。
ZIP_NAME="N03-${YEAR}0101_${PREF}_GML.zip"
URL="https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-${YEAR}/${ZIP_NAME}"

echo "fetch-n03: YEAR=${YEAR} PREF=${PREF}"
echo "  source: ${URL}"
echo "  dest:   ${DEST_DIR}"

mkdir -p "$DEST_DIR"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ZIP_PATH="${TMP_DIR}/${ZIP_NAME}"
# -f で HTTP エラー（404 等）を非ゼロ終了に・-L でリダイレクト追従・--retry で一時失敗を吸収。
if ! curl -fL --retry 3 -o "$ZIP_PATH" "$URL"; then
  echo "ダウンロード失敗（URL を配布ページで確認: https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-${YEAR}.html）" >&2
  exit 1
fi

# 解凍（同名上書き＝再取得しても同結果。冪等）。
unzip -o "$ZIP_PATH" -d "$DEST_DIR" >/dev/null

# 投入が読む GeoJSON が在ることを確かめる（無ければ配布形式が変わった可能性＝気づけるように落とす）。
if ! ls "${DEST_DIR}"/*.geojson >/dev/null 2>&1; then
  echo "展開先に .geojson が無い（${DEST_DIR}）。配布形式の変更を疑う" >&2
  exit 1
fi

echo "fetch-n03: 完了。配置＝${DEST_DIR}"
ls -1 "${DEST_DIR}"
