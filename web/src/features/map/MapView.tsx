import "maplibre-gl/dist/maplibre-gl.css";
import { type ReactNode, useMemo, useState } from "react";
import MapGL, { NavigationControl, ScaleControl } from "react-map-gl/maplibre";
import { createBaseStyle } from "../../lib/basemap";

/** 初期ズーム（首都圏が収まる広さ・docs/02 §5）。ズーム表示の初期値とも共有する。 */
const INITIAL_ZOOM = 9;

/**
 * MapView は GSI 淡色下地の地図を全画面表示する地図機能の入口（ADR-0013/0019）。
 *
 * 初期表示は首都圏（MVP対象・docs/02 §5）が収まる東京周辺。データ層は機能どうしの直接依存を
 * 避けるため（frontend-conventions §1）MapView 自身は知らず、children として app 層が重ねる。
 *
 * 尺度の可視化：現在ズームの数値表示＋スケールバー（距離目盛り）＋ズーム操作ボタンを置く。
 * 見え方（輪郭の濃さ・太さ）を「どのズームか」で会話・調整できるようにするため。
 */
export function MapView({ children }: { children?: ReactNode }) {
  // style はレンダリングごとに作り直す必要がない（実質定数）ため memo 化する。
  const mapStyle = useMemo(() => createBaseStyle(), []);
  // 現在ズーム（表示用）。initialViewState は保ちつつ onMove で読み取るだけ（地図は非制御のまま）。
  const [zoom, setZoom] = useState(INITIAL_ZOOM);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapGL
        initialViewState={{
          // 東京駅付近。MVP対象の首都圏9都県が初期画面に収まる広さ。
          longitude: 139.767,
          latitude: 35.681,
          zoom: INITIAL_ZOOM,
        }}
        style={{ width: "100%", height: "100%" }}
        mapStyle={mapStyle}
        onMove={(e) => setZoom(e.viewState.zoom)}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-left" unit="metric" />
        {children}
      </MapGL>
      {/* 現在ズームの数値表示（尺度の可視化）。地図操作を妨げないよう pointerEvents:none。 */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          padding: "2px 8px",
          borderRadius: 4,
          background: "rgba(255,255,255,0.85)",
          font: "12px/1.4 monospace",
          color: "#334155",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        zoom {zoom.toFixed(1)}
      </div>
    </div>
  ); // MapGL = react-map-gl の maplibre 連携。global Map との混同を避け別名 import（Biome）。
}
