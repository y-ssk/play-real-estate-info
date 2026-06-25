import "maplibre-gl/dist/maplibre-gl.css";
import { type ReactNode, useMemo } from "react";
import MapGL from "react-map-gl/maplibre";
import { createBaseStyle } from "../../lib/basemap";

/**
 * MapView は GSI 淡色下地の地図を全画面表示する地図機能の入口（ADR-0013/0019）。
 *
 * 初期表示は首都圏（MVP対象・docs/02 §5）が収まる東京周辺。データ層は機能どうしの直接依存を
 * 避けるため（frontend-conventions §1）MapView 自身は知らず、children として app 層が重ねる。
 */
export function MapView({ children }: { children?: ReactNode }) {
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
    >
      {children}
    </MapGL>
  ); // MapGL = react-map-gl の maplibre 連携。global Map との混同を避け別名 import（Biome）。
}
