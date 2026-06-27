import { useEffect, useMemo, useRef } from "react";
import { type FillLayer, Layer, type LineLayer, Source, useMap } from "react-map-gl/maplibre";
import { useSelectionStore } from "../../lib/selection";
import {
  CHOROPLETH_FILL_OPACITY_EXPR,
  CHOROPLETH_MATCHED_FILL_OPACITY_EXPR,
  CHOROPLETH_OUTLINE_COLOR,
  CHOROPLETH_OUTLINE_WIDTH,
  CHOROPLETH_SELECTED_OUTLINE_COLOR,
  CHOROPLETH_SELECTED_OUTLINE_WIDTH,
  choroplethFillColor,
  divergingFillColor,
} from "../../styles/mapTokens";
import { DEFAULT_METRIC, METRICS } from "./metrics";
import { useChoroplethGeometry } from "./useChoroplethGeometry";
import { useChoroplethValues } from "./useChoroplethValues";

/** 色分け source の id（geometry と values を結ぶ feature-state の対象）。 */
const SOURCE_ID = "choropleth";
/** 区の輪郭線レイヤーの id。 */
const OUTLINE_LAYER_ID = "choropleth-outline";
/**
 * 面塗りレイヤーの id（輪郭線より下＝線を塗りで隠さない）。
 *
 * 公開する理由：地図クリックで単位を選ぶ際の `interactiveLayerIds`（クリック対象＝面塗り面）に App 層が使う。
 * 機能どうしを直接依存させず（frontend-conventions §1）、合成点の App が「どの面を押せるか」をこの id で指す。
 */
export const CHOROPLETH_FILL_LAYER_ID = "choropleth-fill";
/** ChoroplethLayer 内部の参照名（公開定数と同値・式の中で短く使う）。 */
const FILL_LAYER_ID = CHOROPLETH_FILL_LAYER_ID;

/**
 * 輪郭線のスタイル。色・太さは生値直書きせず用途トークン経由（DESIGN §4）。
 * 面塗りを足した後も輪郭線は残す（区界を読ませる線・タスク死守）。
 */
const outlineLayer: LineLayer = {
  id: OUTLINE_LAYER_ID,
  type: "line",
  source: SOURCE_ID,
  paint: {
    "line-color": CHOROPLETH_OUTLINE_COLOR,
    "line-width": CHOROPLETH_OUTLINE_WIDTH,
  },
};

/** 選択中の単位を縁取る強調レイヤーの id（通常輪郭の上に重ねる）。 */
const SELECTED_LAYER_ID = "choropleth-selected";

/**
 * 選択強調レイヤー（feature-state `selected` が真の feature だけ太い縁取り・任意の強調）。
 * 通常輪郭の上に置き「いま選んでいる区」を示す。選択していない feature は幅0＝描かれない（過剰にしない）。
 */
const selectedLayer: LineLayer = {
  id: SELECTED_LAYER_ID,
  type: "line",
  source: SOURCE_ID,
  paint: {
    "line-color": CHOROPLETH_SELECTED_OUTLINE_COLOR,
    "line-width": CHOROPLETH_SELECTED_OUTLINE_WIDTH,
  },
};

/**
 * 面塗りレイヤーのスタイルを値域と配色方式から組む。
 *
 * 配色方式は指標定義（{@link METRICS}）の `scale` で分岐する：量＝sequential（緑・0起点でなくてよい）、
 * 符号付き＝diverging（0 中央の発散）。**データなしは色抜き**：value（feature-state）が無い/null の feature は
 * fill-opacity を 0 にし基図をそのまま見せる（ADR-0011）。値がある feature だけ不透明度を載せる。
 */
function buildFillLayer(
  min: number,
  max: number,
  scale: "sequential" | "diverging",
  highlight: boolean,
): FillLayer {
  return {
    id: FILL_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color":
        scale === "diverging" ? divergingFillColor(min, max) : choroplethFillColor(min, max),
      // データなしは色抜き（§4）。絞り込みハイライト時は非該当を淡く沈める式へ切り替える（ADR-0012）。
      // 色（値の大小・ADR-0005）はどちらも同じで、強調は不透明度という別チャネルで行う（DESIGN §1）。
      "fill-opacity": highlight
        ? CHOROPLETH_MATCHED_FILL_OPACITY_EXPR
        : CHOROPLETH_FILL_OPACITY_EXPR,
    },
  };
}

/**
 * ChoroplethLayer は境界（形）に指標値を載せて面塗りする（ADR-0016 値とジオメトリの分離）。
 *
 * 形は geojson source（指標に依らず共通＝1度だけ取得）、値は指標ごとに別経路で取得し setFeatureState で
 * 5桁コード結合する（状態の真実は値、setFeatureState は描画の鏡・frontend-conventions §3）。
 * **形と値が両方そろってから state を張る**（source 描画前の setFeatureState は無視されるため）。
 * **指標切替では removeFeatureState で一旦消してから張り直す**（前指標の持ち越し防止・§3）。
 * 配色方式は指標定義の `scale` で分岐（面積=sequential緑／人口増減=diverging紫↔緑・0中央）。
 * データなし（status none/suppressed、value=null）は塗らない＝色抜き（ADR-0011）。
 *
 * 絞り込みハイライト（ADR-0012）：`filterActive` が真の間、`matchedCodes` に含まれる該当区だけ通常塗り、
 * それ以外（present だが非該当）を淡く沈める。色（値の大小）は変えず不透明度という別チャネルで強調する。
 * 真実は filter store（App が条件と単位行から該当を導出して渡す）・地図の `matched` は描画の鏡（§3）。
 *
 * @param metric 表示する指標キー（未指定は {@link DEFAULT_METRIC}）。
 * @param matchedCodes 絞り込み該当の5桁コード集合（filterActive=false のときは無視＝全件通常塗り）。
 * @param filterActive 絞り込みが効いているか（false＝従来の見え方＝全件通常塗り・データなしのみ色抜き）。
 */
export function ChoroplethLayer({
  metric = DEFAULT_METRIC,
  matchedCodes,
  filterActive = false,
}: {
  metric?: string;
  matchedCodes?: ReadonlySet<string>;
  filterActive?: boolean;
}) {
  const { current: map } = useMap();
  const { data: geometry } = useChoroplethGeometry();
  const { data: values } = useChoroplethValues(metric);
  const def = METRICS[metric];
  // 選択中の単位（共有 UI 状態・ADR-0018）。地図の縁取り強調は描画の鏡（真実は store・§3）。
  const selectedUnit = useSelectionStore((s) => s.selectedUnit);
  // 直前に縁取った id を覚え、選択が変わったら確実に外す（古い縁取りの取り残し防止）。
  const prevSelectedRef = useRef<string | null>(null);

  // 値域 [min,max]：present かつ value!=null（数値）の値だけから取る。
  // 符号付き（増減率）は負を含むため min が負になりうる（発散配色が 0 中央で受ける）。
  const range = useMemo(() => {
    const nums = (values ?? [])
      .filter((v) => v.status === "present" && v.value !== null)
      .map((v) => v.value as number);
    if (nums.length === 0) {
      return null;
    }
    return { min: Math.min(...nums), max: Math.max(...nums) };
  }, [values]);

  // 形と値が両方そろってから feature-state を張る（順序：geometry source が描画済みであること）。
  // 値あり（present・数値）だけ value を載せ、データなし（none/suppressed・null）は state を張らない
  // ＝色抜き条件（fill-opacity の present フラグ）に乗る。毎回 removeFeatureState で一旦消してから張り直す
  // （前指標の値が残らない）。**指標切替は values が差し替わる（query キーに metric を含む）ことで本 effect が
  // 再実行されるため、metric 自体を依存に足す必要はない**（values が真実・metric は冗長依存＝Biome 指摘）。
  useEffect(() => {
    if (!map || !geometry || !values) {
      return;
    }
    const m = map.getMap();
    // 前回分を消す（指標切替・再取得での持ち越し防止）。source 未読込時は no-op。
    m.removeFeatureState({ source: SOURCE_ID });
    for (const v of values) {
      if (v.status === "present" && v.value !== null) {
        // present フラグも張る＝色抜き判定（fill-opacity）に使う。値0（該当なし）も present=true で塗る。
        m.setFeatureState({ source: SOURCE_ID, id: v.code }, { value: v.value, present: true });
      }
    }
  }, [map, geometry, values]);

  // 絞り込みハイライト（ADR-0012）：present な feature に `matched` を張る（描画の鏡・§3）。
  // 絞り込み中（filterActive）は matchedCodes に含まれる該当だけ true、それ以外は false（＝淡く沈む）。
  // 絞り込み未使用時は present な全 feature に true を張る＝全件が通常塗り（従来の見え方を壊さない）。
  // **values を依存に持つのは load-bearing**：値 effect が removeFeatureState で全 state を消すため、その後に
  // 本 effect を再走させて matched を張り直さないと色抜き条件しか残らず塗りが出ない（selected effect と同型）。
  // 本 effect は values を依存配列に明示しているため抑制コメントは要らない（selected は values を省くため抑制が要る）。
  useEffect(() => {
    if (!map || !geometry || !values) {
      return;
    }
    const m = map.getMap();
    for (const v of values) {
      if (v.status !== "present" || v.value === null) {
        continue; // データなしは色抜き（matched に依らず present 式で0）。matched は張らない。
      }
      const matched = filterActive ? (matchedCodes?.has(v.code) ?? false) : true;
      m.setFeatureState({ source: SOURCE_ID, id: v.code }, { matched });
    }
  }, [map, geometry, values, matchedCodes, filterActive]);

  // 選択強調（任意）：選択中の単位に feature-state `selected` を張り、縁取りで示す。
  // 状態の真実は store・ここは描画の鏡（§3）。選択 id は geometry の feature.id（5桁コード）と一致する。
  // 古い選択は明示的に false へ戻す（prevSelectedRef）。
  // **values を依存に持つのは冗長でなく load-bearing**：値の effect が removeFeatureState で source の全 state を
  // 消すため（指標切替・再取得時）、その後に本 effect を再走させて `selected` を張り直さないと縁取りが消える。
  // Biome は effect 間のこの結合（remove が selected も道連れにする）を見抜けず冗長と誤判定するため抑制する。
  // biome-ignore lint/correctness/useExhaustiveDependencies: values は値 effect の全消去後に選択を再適用するため必要
  useEffect(() => {
    if (!map || !geometry) {
      return;
    }
    const m = map.getMap();
    const prev = prevSelectedRef.current;
    const next = selectedUnit?.unitId ?? null;
    if (prev && prev !== next) {
      m.setFeatureState({ source: SOURCE_ID, id: prev }, { selected: false });
    }
    if (next) {
      m.setFeatureState({ source: SOURCE_ID, id: next }, { selected: true });
    }
    prevSelectedRef.current = next;
  }, [map, geometry, values, selectedUnit]);

  // 取得前・失敗時は Source を出さない（基図のみで壊れない・タスクのローディング方針）。
  if (geometry === undefined) {
    return null;
  }

  // 値域が無い間（値未取得/全データなし）は面塗りを出さず輪郭線のみ＝形は先に見える。
  // scale は指標定義から（未知 metric は安全側で sequential）。
  const scale = def?.scale ?? "sequential";
  const fillLayer = range ? buildFillLayer(range.min, range.max, scale, filterActive) : null;

  return (
    // feature.id は geometry API が5桁コードを付与済み（文字列トップレベル id）。MapLibre はこれを
    // feature-state の結合に使える（実機で確認済＝色分けが効いていた）。promoteId は付けない。
    <Source id={SOURCE_ID} type="geojson" data={geometry}>
      {/* 面塗り（下）→ 輪郭線（中）→ 選択強調（上）の順で重ね、塗り/通常線が選択縁を隠さないようにする。 */}
      {fillLayer && <Layer {...fillLayer} />}
      <Layer {...outlineLayer} />
      <Layer {...selectedLayer} />
    </Source>
  );
}
