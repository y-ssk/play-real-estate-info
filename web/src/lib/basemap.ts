import type { StyleSpecification } from "maplibre-gl";

/**
 * 地理院地図（GSI）淡色タイルの URL テンプレート。
 *
 * @see https://maps.gsi.go.jp/development/ichiran.html 地理院タイル一覧（出典・利用規約）
 * 形式 PNG・座標系 Web メルカトル(3857)＝配信3857（ADR-0014）と一致し MapLibre 側で吸収不要。
 */
const GSI_PALE_TILES = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";

/**
 * 出典表示（法的要件・ADR-0011）。MapLibre の AttributionControl が source の
 * attribution を自動表示する。淡色タイルの帰属は「国土地理院」。
 */
const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル（国土地理院）</a>';

/**
 * createBaseStyle は GSI 淡色ラスタ1枚を下地に敷いた自前 style を返す（ADR-0019）。
 *
 * なぜ自前 style か：外部 style URL に依存せずトークン不要・透明にするため。
 * この上に我々のデータ層（ベクタ＝GeoJSON→MVT）を layers 配列の後ろへ重ねていく（段1以降）。
 */
export function createBaseStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      gsi_pale: {
        type: "raster",
        tiles: [GSI_PALE_TILES],
        tileSize: 256,
        // 淡色タイルの最大ズーム（一覧ページ確認値）。これ以上は overzoom で拡大表示。
        maxzoom: 18,
        attribution: GSI_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: "gsi_pale",
        type: "raster",
        source: "gsi_pale",
      },
    ],
  };
}
