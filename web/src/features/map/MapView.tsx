import "maplibre-gl/dist/maplibre-gl.css";
import { type ReactNode, useMemo, useState } from "react";
import MapGL, {
  type MapLayerMouseEvent,
  NavigationControl,
  ScaleControl,
} from "react-map-gl/maplibre";
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
 *
 * クリックの結線（カルテ・ADR-0011/0018）：押せるレイヤー（面塗り面）の id を `interactiveLayerIds` で
 * 受け、クリックの `MapLayerMouseEvent` をそのまま `onMapClick` で外（合成点の App）へ渡す。MapView 自身は
 * 「何を選ぶか」を知らず（機能どうしを直接依存させない・frontend-conventions §1）、App が選択状態へ橋渡しする。
 */
export function MapView({
  children,
  interactiveLayerIds,
  onMapClick,
}: {
  children?: ReactNode;
  /** クリック可能なレイヤーの id（面塗り面）。これに当たった feature だけ event.features に載る。 */
  interactiveLayerIds?: string[];
  /** クリックイベント（合成点の App が feature.id から選択単位を取り出す）。 */
  onMapClick?: (e: MapLayerMouseEvent) => void;
}) {
  // style はレンダリングごとに作り直す必要がない（実質定数）ため memo 化する。
  const mapStyle = useMemo(() => createBaseStyle(), []);
  // 現在ズーム（表示用）。initialViewState は保ちつつ onMove で読み取るだけ（地図は非制御のまま）。
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  // 押せる面（interactiveLayerIds）にカーソルが乗っているか。**カーソルは react-map-gl の `cursor` prop で
  // 制御する**＝react-map-gl は毎レンダー canvas の cursor を prop から再適用するため、レイヤー側で
  // getCanvas().style.cursor を直接書いても上書きされ効かない（層4で「カーソルがドラッグの手のまま」の原因）。
  // react-map-gl の onMouseEnter/Leave は interactiveLayerIds の feature 出入りで発火するのでそれに乗せる。
  const [overInteractive, setOverInteractive] = useState(false);

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
        interactiveLayerIds={interactiveLayerIds}
        onClick={onMapClick}
        // 押せる面に乗ったら pointer（離れたら既定＝パン用の手）。react-map-gl がこの prop で canvas に適用する。
        cursor={overInteractive ? "pointer" : undefined}
        onMouseEnter={() => setOverInteractive(true)}
        onMouseLeave={() => setOverInteractive(false)}
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
