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
  onMapMouseMove,
  onMapMouseLeave,
}: {
  children?: ReactNode;
  /** クリック可能なレイヤーの id（面塗り面）。これに当たった feature だけ event.features に載る。 */
  interactiveLayerIds?: string[];
  /** クリックイベント（合成点の App が feature.id から選択単位を取り出す）。 */
  onMapClick?: (e: MapLayerMouseEvent) => void;
  /** マウス移動（App が feature からホバー中の単位コードを取る・クリックと同じ event 経路）。 */
  onMapMouseMove?: (e: MapLayerMouseEvent) => void;
  /** 地図外へ出た（App がホバーを外す）。 */
  onMapMouseLeave?: () => void;
}) {
  // style はレンダリングごとに作り直す必要がない（実質定数）ため memo 化する。
  const mapStyle = useMemo(() => createBaseStyle(), []);
  // 現在ズーム（表示用）。initialViewState は保ちつつ onMove で読み取るだけ（地図は非制御のまま）。
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  // カーソル：**ホバー中は pointer（押せる合図）／ボタンを押している間は grabbing（つかむ手）**。離して選択中に
  // なったら pointer に戻す（オーナー指定）。＝ドラッグ（押して動かす）だけでなく**押下中**で切り替えるため
  // onMouseDown/Up を使う（onDragStart は「動かし始め」まで発火せずクリック押下中は変わらない）。
  // react-map-gl は canvas の cursor を `cursor` prop から毎レンダー適用するため prop で制御する
  // （レイヤー側で getCanvas().style.cursor を直接書いても上書きされ効かない＝層4 で判明）。
  const [pressing, setPressing] = useState(false);

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
        onMouseMove={onMapMouseMove}
        onMouseLeave={() => {
          setPressing(false); // 地図外で離した取り残し防止。
          onMapMouseLeave?.();
        }}
        // ホバー=pointer／ボタン押下中=grabbing（つかむ手）。離したら pointer。
        cursor={pressing ? "grabbing" : "pointer"}
        onMouseDown={() => setPressing(true)}
        onMouseUp={() => setPressing(false)}
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
