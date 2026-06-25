import { ChoroplethLayer } from "../features/choropleth/ChoroplethLayer";
import { MapView } from "../features/map/MapView";

/**
 * App は全体レイアウトの最上位（app 層・frontend-conventions §1）。
 * 機能どうしは直接依存させず、app 層が地図（map）の上に色分け（choropleth）を重ねる合成点。
 * パネル/フィルタ等の UI は後続スライスで重ねる（DESIGN §2）。
 */
export function App() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapView>
        <ChoroplethLayer />
      </MapView>
    </div>
  );
}
