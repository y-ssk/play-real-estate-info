#!/usr/bin/env bash
# ingest-n03.sh YEAR PREF
#   配置規約 data/n03/{YEAR}/{PREF}/ の GeoJSON を、使い捨て GDAL コンテナの ogr2ogr で
#   生テーブル n03_raw へ無加工のまま写す（投入工程）。正規化（admin_unit 化）は後段の go run ./cmd/ingest。
#
# 設計（ADR-0023・ADR-0024・backend-conventions §5/§5.1）：
#   - 使い捨て別コンテナ＝GDAL 公式イメージ ghcr.io/osgeo/gdal を docker run --rm --network=host で起動し終了後破棄。
#     DB イメージ（postgis/postgis）は公式のまま改変しない（攻撃面最小・再現性）。
#   - 入力＝GeoJSON（UTF-8・EPSG:6668 自己宣言＝文字化けリスク無し。.shp の CP932 / .prj の Esri WKT 名を避ける）。
#   - 冪等＝-overwrite（再実行しても同結果。n03_raw を毎回作り直す）。
#   - 接続情報は POSTGRES_*（compose/Makefile と同一変数）。パスワードは -e PGPASSWORD でコンテナ環境変数に渡し、
#     接続文字列（PG: ... ）には埋めない＝端末/ps/履歴に出さない。set -x はしない。
#
# 例: scripts/ingest-n03.sh 2023 13
set -euo pipefail

YEAR="${1:-}"
PREF="${2:-}"
if [ -z "$YEAR" ] || [ -z "$PREF" ]; then
  echo "usage: $0 YEAR PREF   (例: $0 2023 13)" >&2
  exit 2
fi

# 秘匿は AI 不可触ゆえ中身は見ず source するだけ（POSTGRES_* を環境変数に載せる・CLAUDE.md / ADR-0024）。
# shellcheck disable=SC1090
[ -f ~/.config/config.env ] && source ~/.config/config.env

# 未設定は即エラー（握りつぶさない＝compose の ${VAR:?} と同じ思想）。値は表示しない。
: "${POSTGRES_USER:?POSTGRES_USER 未設定。~/.config/config.env を source（README 参照）}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD 未設定。~/.config/config.env を source（README 参照）}"
: "${POSTGRES_DB:?POSTGRES_DB 未設定。~/.config/config.env を source（README 参照）}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

GDAL_IMAGE="${GDAL_IMAGE:-ghcr.io/osgeo/gdal}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${REPO_ROOT}/data/n03/${YEAR}/${PREF}"

if [ ! -d "$DATA_DIR" ]; then
  echo "データが無い（${DATA_DIR}）。先に scripts/fetch-n03.sh ${YEAR} ${PREF}（make fetch-n03）" >&2
  exit 1
fi

# 入力 GeoJSON を1件に確定（fetch-n03 が展開した *.geojson）。複数/0件なら取り違えを避けて落とす。
shopt -s nullglob
geojsons=("${DATA_DIR}"/*.geojson)
shopt -u nullglob
if [ "${#geojsons[@]}" -eq 0 ]; then
  echo "GeoJSON が無い（${DATA_DIR}/*.geojson）。fetch-n03 をやり直す" >&2
  exit 1
fi
if [ "${#geojsons[@]}" -gt 1 ]; then
  echo "GeoJSON が複数ある（${DATA_DIR}）。1ファイルに整理する" >&2
  printf '  %s\n' "${geojsons[@]}" >&2
  exit 1
fi
GEOJSON_HOST="${geojsons[0]}"
GEOJSON_NAME="$(basename "$GEOJSON_HOST")"

echo "ingest-n03: YEAR=${YEAR} PREF=${PREF} input=${GEOJSON_NAME} → table n03_raw"

# --network=host で host の localhost:PORT（compose が publish）へ届く＝migrate と同じ流儀。
# PG: 接続文字列にはパスワードを入れない（PGPASSWORD で渡す）。GEOMETRY_NAME/SPATIAL_INDEX は
# 後段（admin_unit のディゾルブ）が geom 列で読めるよう揃える。-a_srs は .geojson が EPSG:6668 を
# 自己宣言しているため再投影せず SRID を確定する目的（座標値はそのまま）。
docker run --rm --network=host \
  -e PGPASSWORD="$POSTGRES_PASSWORD" \
  -v "${DATA_DIR}:/data:ro" \
  "$GDAL_IMAGE" \
  ogr2ogr \
    -f PostgreSQL \
    "PG:host=localhost port=${POSTGRES_PORT} dbname=${POSTGRES_DB} user=${POSTGRES_USER}" \
    "/data/${GEOJSON_NAME}" \
    -nln n03_raw \
    -overwrite \
    -a_srs EPSG:6668 \
    -lco GEOMETRY_NAME=geom \
    -lco SPATIAL_INDEX=GIST

echo "ingest-n03: n03_raw への投入完了。次に正規化（go run ./cmd/ingest -year=${YEAR} -pref=${PREF}）"
