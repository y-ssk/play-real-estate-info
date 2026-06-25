import "maplibre-gl/dist/maplibre-gl.css";
import { useMemo } from "react";
import MapGL from "react-map-gl/maplibre";
import { createBaseStyle } from "../../lib/basemap";

/**
 * MapView は GSI 淡色下地の地図を全画面表示する地図機能の入口（ADR-0013/0019）。
 *
 * 段0：データ層を持たない空の地図（下地のみ）。初期表示は首都圏（MVP対象・docs/02 §5）が
 * 収まる東京周辺。データ層（面塗り・重ね）は段1以降にこの Map の子として足す。
 */
export function MapView() {
  // style はレンダリングごとに作り直す必要がない（実質定数）ため memo 化する。
  const mapStyle = useMemo(() => createBaseStyle(), []);

  return (
    <MapGL
      initialViewState={{
        // 東京駅付近。MVP対象の首都圏9都県が初期画面に収まる広さ。
        longitude: 139.767,
        latitude: 35.681,
        zoom: 9,
      }}
      style={{ width: "100%", height: "100%" }}
      mapStyle={mapStyle}
    />
  ); // MapGL = react-map-gl の maplibre 連携。global Map との混同を避け別名 import（Biome）。
}
