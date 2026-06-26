import { ChoroplethLayer } from "../features/choropleth/ChoroplethLayer";
import { ChoroplethLegend } from "../features/choropleth/ChoroplethLegend";
import { MapView } from "../features/map/MapView";

/**
 * App は全体レイアウトの最上位（app 層・frontend-conventions §1）。
 * 機能どうしは直接依存させず、app 層が地図（map）の上に色分け（choropleth）を重ねる合成点。
 * 面塗りは地図レイヤー（MapView の子）、凡例は地図上の DOM オーバーレイ（兄弟）として重ねる。
 * パネル/フィルタ等の UI は後続スライスで重ねる（DESIGN §2）。
 */
export function App() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapView>
        <ChoroplethLayer />
      </MapView>
      <ChoroplethLegend />
    </div>
  );
}
