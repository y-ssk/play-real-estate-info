import { MapView } from "../features/map/MapView";

/**
 * App は全体レイアウトの最上位（app 層・frontend-conventions §1）。
 * 段0 は地図を全画面に敷くだけ。パネル/フィルタ等の UI は段1以降に重ねる（DESIGN §2）。
 */
export function App() {
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <MapView />
    </div>
  );
}
