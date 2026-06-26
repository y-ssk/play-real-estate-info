#!/usr/bin/env bash
# fetch-xkt015.sh
#   国土数値情報 駅別乗降客数(XKT015) API を XYZ タイル方式（z=11）で取得し、
#   配置規約 data/xkt015/{YEAR}/{PREF}/z11_{x}_{y}.geojson へ保存する（取得工程）。
#   集計（市区町村への割付・S12_054=1 合計）は後段の go run ./cmd/ingest -metric=station_passengers_2023。
#
# 設計（fetch-n03.sh と同じ流儀・backend-conventions §5/§5.1・ADR-0007/0015）：
#   - 取得は低頻度（年次更新）ゆえ完全自動化せず、直リンク（タイル URL）の取得スクリプトで半自動。
#   - 認証はヘッダ Ocp-Apim-Subscription-Key（鍵は環境変数 MLIT_API_KEY）。
#     **AI は鍵の値に触れない**＝このスクリプトは値を echo/ログ/コミットに出さない（存在確認のみ）。
#   - 東京本土をカバーする z=11 タイル群をスイープ（島嶼は駅が無いため本土 bbox に限定）。
#     bbox lon138.9–139.95 / lat35.5–35.9 を覆うタイル範囲を GSI のタイル座標式で算出した結果＝
#     x=1814..1820（7列）/ y=804..807（4行）の 28 タイル（算出根拠は下の TILE_* コメント）。
#   - レート制御＝タイル間に短い待ち（連続実行で API を叩き続けない）。
#   - 冪等＝同パスに上書き保存（再取得しても同結果）。set -x はしない（鍵がコマンド展開に出るのを避ける）。
#
# 例: scripts/fetch-xkt015.sh                 # 既定（2023・東京13・z11 本土スイープ）
#     YEAR=2023 PREF=13 scripts/fetch-xkt015.sh
set -euo pipefail

# 既定は段1 の対象＝令和5年版・東京都（XKT015 は年次を URL に持たず、保存パスの版管理にのみ使う）。
YEAR="${YEAR:-2023}"
PREF="${PREF:-13}"

# 秘匿は AI 不可触ゆえ中身は見ず source するだけ（MLIT_API_KEY を環境変数に載せる・CLAUDE.md）。
# shellcheck disable=SC1090
[ -f ~/.config/config.env ] && source ~/.config/config.env

# 鍵未設定は即エラー（握りつぶさない）。**値は表示しない**＝存在確認のみ（CLAUDE.md ハードルール）。
if [ -z "${MLIT_API_KEY:-}" ]; then
  echo "MLIT_API_KEY 未設定。~/.config/config.env を source（README 参照）" >&2
  exit 1
fi

ENDPOINT="https://www.reinfolib.mlit.go.jp/ex-api/external/XKT015"
ZOOM=11

# z=11 タイル範囲（東京本土 bbox を覆う矩形）。GSI XYZ 方式の式で算出済み（fetch 前に Python で確認）：
#   x = floor((lon+180)/360 * 2^z)
#   y = floor((1 - asinh(tan(lat))/pi)/2 * 2^z)
#   lon138.9–139.95 → x=1814..1820 / lat35.5–35.9 → y=804..807
# 島嶼（伊豆・小笠原）は駅が無く乗降客数に寄与しないため本土矩形に限定する（取得タイル数を抑える）。
TILE_X_MIN=1814
TILE_X_MAX=1820
TILE_Y_MIN=804
TILE_Y_MAX=807

# タイル間の待ち（秒）。レート制御＝連続実行を避ける（API への配慮・backend-conventions §5）。
SLEEP_SEC="${SLEEP_SEC:-1}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${REPO_ROOT}/data/xkt015/${YEAR}/${PREF}"
mkdir -p "$DEST_DIR"

echo "fetch-xkt015: YEAR=${YEAR} PREF=${PREF} z=${ZOOM} tiles x[${TILE_X_MIN}..${TILE_X_MAX}] y[${TILE_Y_MIN}..${TILE_Y_MAX}]"
echo "  dest: ${DEST_DIR}"

total=0
saved=0
for ((x = TILE_X_MIN; x <= TILE_X_MAX; x++)); do
  for ((y = TILE_Y_MIN; y <= TILE_Y_MAX; y++)); do
    total=$((total + 1))
    out="${DEST_DIR}/z${ZOOM}_${x}_${y}.geojson"
    url="${ENDPOINT}?response_format=geojson&z=${ZOOM}&x=${x}&y=${y}"

    # -f で HTTP エラー（4xx/5xx）を非ゼロ終了に・-s で進捗を出さない・-S でエラーは見せる。
    # 鍵はヘッダで渡す＝URL/ログに出さない。-H の値はコマンドライン上に出るが set -x していないため端末に展開されない。
    if ! curl -fsS \
      -H "Ocp-Apim-Subscription-Key: ${MLIT_API_KEY}" \
      -o "${out}.tmp" \
      "$url"; then
      echo "  取得失敗 z${ZOOM}/${x}/${y}（URL/鍵/レート上限を確認）" >&2
      rm -f "${out}.tmp"
      exit 1
    fi

    # 応答が GeoJSON FeatureCollection であることを最低限確かめる（HTML エラーページ等の取り違え検知）。
    # 鍵切れ等で 200+エラー本文が返る場合に備え、type:FeatureCollection の存在だけ見て落とす（中身は集計側で検証）。
    if ! grep -q '"FeatureCollection"' "${out}.tmp"; then
      echo "  応答が GeoJSON でない z${ZOOM}/${x}/${y}（鍵/エンドポイントを確認）" >&2
      rm -f "${out}.tmp"
      exit 1
    fi

    # 原子的に確定（途中失敗で壊れたファイルを残さない＝冪等の担保）。
    mv -f "${out}.tmp" "$out"
    saved=$((saved + 1))

    sleep "$SLEEP_SEC"
  done
done

echo "fetch-xkt015: 完了。取得 ${saved}/${total} タイル → ${DEST_DIR}"
ls -1 "${DEST_DIR}" | head
