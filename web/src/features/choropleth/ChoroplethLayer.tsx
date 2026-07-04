import { useEffect, useMemo, useRef } from "react";
import { type FillLayer, Layer, type LineLayer, Source, useMap } from "react-map-gl/maplibre";
import { useSelectionStore } from "../../lib/selection";
import {
  CHOROPLETH_DIM_FILL_COLOR,
  CHOROPLETH_DIM_FILL_OPACITY_EXPR,
  CHOROPLETH_FILL_OPACITY_EXPR,
  CHOROPLETH_HOVER_FILL_COLOR,
  CHOROPLETH_HOVER_FILL_OPACITY_EXPR,
  CHOROPLETH_HOVER_OUTLINE_COLOR,
  CHOROPLETH_HOVER_OUTLINE_WIDTH,
  CHOROPLETH_MATCHED_OUTLINE_COLOR,
  CHOROPLETH_MATCHED_OUTLINE_WIDTH,
  CHOROPLETH_OUTLINE_COLOR,
  CHOROPLETH_OUTLINE_WIDTH,
  CHOROPLETH_SELECTED_OUTLINE_COLOR,
  CHOROPLETH_SELECTED_OUTLINE_WIDTH,
  choroplethFillColor,
  divergingFillColor,
} from "../../styles/mapTokens";
import { DEFAULT_METRIC, METRICS, sequentialFillRamp } from "./metrics";
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
 * source が地図スタイルに生成済みかを確かめる（4つの feature-state effect の共通ガード）。
 *
 * なぜ要るか：`setFeatureState`/`removeFeatureState` は対象 source がスタイルに無いと MapLibre が
 * 例外を投げる（`The source 'choropleth' does not exist in the map's style.`）。React の <Source> は
 * 描画コミット後に生成されるため、geometry 到着直後の effect 実行が source 生成より先行しうる
 * （値・選択・ホバー・matched の4 effect すべてが同じ前提＝source 未生成では state を触らない）。
 * `getSource` で存在を確かめてから触る（無ければ呼ばない＝次の依存変化での再実行で張られる）。
 */
function hasChoroplethSource(m: { getSource: (id: string) => unknown }): boolean {
  return m.getSource(SOURCE_ID) != null;
}

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

/** 絞り込み非該当を沈める白スクリム（面）の id（データ塗りの上・ホバー面より下）。 */
const DIM_FILL_LAYER_ID = "choropleth-dim-fill";

/**
 * 非該当沈めスクリム（feature-state `matched` が false の区だけ白を重ね、データ色・基図を白へ寄せる）。
 * 絞り込み（④・ADR-0028）の**別チャネル**：値の色は触らず、非該当だけ沈めて該当を相対的に前へ出す
 * （ADR-0005 値の色と別チャネル）。`matched` 未設定（絞り込み非作動）は不透明度0＝何も起きない＝普通の色分け地図。
 * データ塗りの上だがホバー面（near-black 一時）より下に置く＝ホバーの合図はスクリムに埋もれない。
 * 色/不透明度は mapTokens に集約（生値を書かない・§4）。
 */
const dimFillLayer: FillLayer = {
  id: DIM_FILL_LAYER_ID,
  type: "fill",
  source: SOURCE_ID,
  paint: {
    "fill-color": CHOROPLETH_DIM_FILL_COLOR,
    "fill-opacity": CHOROPLETH_DIM_FILL_OPACITY_EXPR,
  },
};

/** 絞り込み該当区を縁取る強調レイヤーの id（通常輪郭の上・ホバー/選択より下）。 */
const MATCHED_LAYER_ID = "choropleth-matched";

/**
 * 絞り込み該当強調レイヤー（feature-state `matched` が真の feature だけコーラルで縁取る）。
 * 非該当を沈めるだけでなく該当を積極的に縁取り「条件に合う街」を読ませる二段構え（ADR-0028）。
 * 通常輪郭の上・ホバー/選択の下に置く＝確定（選択コーラル太）・一時（ホバー near-black）が該当縁の上に勝つ
 * （序列：選択 > ホバー > 該当 > 通常）。乗っていない feature は幅0＝描かれない。色/太さは mapTokens（§4）。
 */
const matchedLayer: LineLayer = {
  id: MATCHED_LAYER_ID,
  type: "line",
  source: SOURCE_ID,
  paint: {
    "line-color": CHOROPLETH_MATCHED_OUTLINE_COLOR,
    "line-width": CHOROPLETH_MATCHED_OUTLINE_WIDTH,
  },
};

/** ホバー中の自治体の全面オーバーレイ（面）の id（データ塗りの上・通常輪郭より下）。 */
const HOVER_FILL_LAYER_ID = "choropleth-hover-fill";

/**
 * ホバー面オーバーレイ（feature-state `hover` が真の自治体だけ淡い中立を全面に重ねる・一時の合図）。
 * 輪郭線だけでなく「面（ポリゴン全体）が反応する」感を出す（層4 目視の指摘）。データ塗りの上に置くが
 * 不透明度を抑え（{@link CHOROPLETH_HOVER_FILL_OPACITY_EXPR}＝0.28・層4で0.12は淡すぎたため引き上げ）データ色・基図は残る。
 * 色/不透明度は mapTokens に集約（生値を書かない・§4）。輪郭線と同じ `hover` フラグで面+線が連動する。
 */
const hoverFillLayer: FillLayer = {
  id: HOVER_FILL_LAYER_ID,
  type: "fill",
  source: SOURCE_ID,
  paint: {
    "fill-color": CHOROPLETH_HOVER_FILL_COLOR,
    "fill-opacity": CHOROPLETH_HOVER_FILL_OPACITY_EXPR,
  },
};

/** ホバー中の単位を縁取る一時強調レイヤーの id（通常輪郭の上・選択強調より下）。 */
const HOVER_LAYER_ID = "choropleth-hover";

/**
 * ホバー強調レイヤー（feature-state `hover` が真の feature だけ near-black 中立で縁取り・一時の合図）。
 * 通常輪郭の上・選択強調の下に置く＝ホバー中かつ選択中は選択（コーラル brand）が上に勝つ（一時より確定優先）。
 * 乗っていない feature は幅0＝描かれない（過剰にしない）。色/太さは mapTokens に集約（生値を書かない・§4）。
 * 面オーバーレイ（{@link hoverFillLayer}）と同じ `hover` フラグで連動＝面+線が一緒に強調される。
 */
const hoverLayer: LineLayer = {
  id: HOVER_LAYER_ID,
  type: "line",
  source: SOURCE_ID,
  paint: {
    "line-color": CHOROPLETH_HOVER_OUTLINE_COLOR,
    "line-width": CHOROPLETH_HOVER_OUTLINE_WIDTH,
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
 * 配色方式は指標定義（{@link METRICS}）の `scale` で分岐する：量＝sequential（分野色相の逐次ランプ・
 * `ADR-0032`＝緑/相場・紫/将来・灰/基盤。0起点でなくてよい）、符号付き＝diverging（0 中央の発散・PRGn 固定）。
 * 逐次のランプは `ramp`（呼び出し側が指標の色相から解決＝{@link sequentialFillRamp}）で渡す。
 * **データなしは色抜き**：value（feature-state）が無い/null の feature は fill-opacity を 0 にし基図を
 * そのまま見せる（ADR-0011）。値がある feature だけ不透明度を載せる。
 */
function buildFillLayer(
  min: number,
  max: number,
  scale: "sequential" | "diverging",
  ramp: readonly string[],
): FillLayer {
  return {
    id: FILL_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color":
        scale === "diverging" ? divergingFillColor(min, max) : choroplethFillColor(min, max, ramp),
      // データなしは色抜き（state 未設定/null は不透明度0）。式はトークンに集約（§4）。
      "fill-opacity": CHOROPLETH_FILL_OPACITY_EXPR,
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
 * @param metric 表示する指標キー（未指定は {@link DEFAULT_METRIC}）。
 * @param hoveredId ホバー中の単位コード（5桁）。App が react-map-gl の onMouseMove で取り、ここで
 *   feature-state `hover` に張り替える（選択と同じく「真実は外・ここは描画の鏡」）。
 * @param matchedCodes 絞り込み該当区の5桁コード集合（④・ADR-0028）。**null＝絞り込み非作動**＝
 *   `matched` を一切張らず普通の色分け地図。Set のときだけ該当に `matched=true`・非該当に `matched=false` を張り、
 *   非該当を白で沈め該当をコーラルで縁取る（値の色とは別チャネル・ADR-0005）。真実は filter store・ここは描画の鏡（§3）。
 */
export function ChoroplethLayer({
  metric = DEFAULT_METRIC,
  hoveredId,
  matchedCodes,
}: {
  metric?: string;
  hoveredId?: string | null;
  matchedCodes?: ReadonlySet<string> | null;
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
    // source 未生成（<Source> 描画コミット前）では MapLibre が例外を投げるため触らない（次の再実行で張る）。
    if (!hasChoroplethSource(m)) {
      return;
    }
    // 前回分を消す（指標切替・再取得での持ち越し防止）。
    m.removeFeatureState({ source: SOURCE_ID });
    for (const v of values) {
      if (v.status === "present" && v.value !== null) {
        // present フラグも張る＝色抜き判定（fill-opacity）に使う。値0（該当なし）も present=true で塗る。
        m.setFeatureState({ source: SOURCE_ID, id: v.code }, { value: v.value, present: true });
      }
    }
  }, [map, geometry, values]);

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
    // source 未生成では feature-state を触らない（例外回避・共通前提）。次の再実行で張り直る。
    if (!hasChoroplethSource(m)) {
      return;
    }
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

  // ホバー強調（スライス3.6）：App から渡る `hoveredId` に feature-state `hover` を張り替え、面の淡い
  // オーバーレイ＋near-black の縁取りで「いま触れている区」を示す。**選択と同じく「真実は外（App の状態）・
  // ここは描画の鏡」**に統一する（frontend-conventions §3）。
  // なぜ App 経由か：旧実装は生の `map.on('mousemove', layer)` で張っていたが react-map-gl 配下では発火せず
  // 層4 で全く反応しなかった（一方 react-map-gl の onClick は効きカルテは開いていた）。＝ホバーもクリックと
  // 同じ react-map-gl のイベント（App の onMouseMove/Leave）に載せ、確実に発火させる。直前 id を覚えて確実に外す。
  const prevHoverRef = useRef<string | null>(null);
  // **values を依存に持つのは selected と同じく load-bearing**：値の effect が removeFeatureState で source の
  // 全 state を消すため（指標切替・再取得時）、その後に本 effect を再走させて `hover` を張り直さないと
  // ホバー面+縁取りが道連れに消えたまま戻らない（selected が values 依存で対処済みなのと対称化）。
  // Biome は effect 間のこの結合を見抜けず冗長と誤判定するため抑制する。
  // biome-ignore lint/correctness/useExhaustiveDependencies: values は値 effect の全消去後にホバーを再適用するため必要
  useEffect(() => {
    if (!map || !geometry) {
      return;
    }
    const m = map.getMap();
    // source 未生成では feature-state を触らない（例外回避・共通前提）。次の再実行で張り直る。
    if (!hasChoroplethSource(m)) {
      return;
    }
    const prev = prevHoverRef.current;
    const next = hoveredId ?? null;
    if (prev && prev !== next) {
      m.setFeatureState({ source: SOURCE_ID, id: prev }, { hover: false });
    }
    if (next) {
      m.setFeatureState({ source: SOURCE_ID, id: next }, { hover: true });
    }
    prevHoverRef.current = next;
  }, [map, geometry, values, hoveredId]);

  // 絞り込みハイライト（④・ADR-0028）：filter store の該当集合（App 経由 matchedCodes）を feature-state
  // `matched` に張る。**null＝非作動**。Set のときは geometry の全 feature に該当=true・非該当=false を張る
  // （false は「沈める」スクリムの判定に必要・mapTokens の `== false`）。値の色とは別チャネル（ADR-0005）・
  // 真実は store・ここは描画の鏡（§3）。
  // **非作動への戻しは「直前に matched を張っていたときだけ」消す**（prevMatchedActiveRef）＝条件入力前の
  // 普通の色分け地図では本 effect を no-op にし、無駄な per-feature remove を出さない（毎レンダの空振り回避）。
  // **values 依存は load-bearing**：値 effect の removeFeatureState が `matched` も道連れに消すため、その後に
  // 再走して張り直さないとハイライトが消える（selected/hover と同じ結合）。Biome は見抜けず誤判定ゆえ抑制。
  const prevMatchedActiveRef = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: values は値 effect の全消去後にハイライトを再適用するため必要
  useEffect(() => {
    if (!map || !geometry) {
      return;
    }
    const m = map.getMap();
    // source 未生成では feature-state を触らない（例外回避・共通前提）。次の再実行で張り直る。
    if (!hasChoroplethSource(m)) {
      return;
    }
    if (matchedCodes == null) {
      // 非作動：直前に張っていた matched だけ消す（一度も張っていなければ no-op＝普通の色分けのまま）。
      if (prevMatchedActiveRef.current) {
        for (const f of geometry.features) {
          const code = typeof f.id === "string" ? f.id : f.properties?.code;
          if (code) {
            m.removeFeatureState({ source: SOURCE_ID, id: code }, "matched");
          }
        }
        prevMatchedActiveRef.current = false;
      }
      return;
    }
    for (const f of geometry.features) {
      const code = typeof f.id === "string" ? f.id : f.properties?.code;
      if (code) {
        m.setFeatureState({ source: SOURCE_ID, id: code }, { matched: matchedCodes.has(code) });
      }
    }
    prevMatchedActiveRef.current = true;
  }, [map, geometry, values, matchedCodes]);

  // 取得前・失敗時は Source を出さない（基図のみで壊れない・タスクのローディング方針）。
  if (geometry === undefined) {
    return null;
  }

  // 値域が無い間（値未取得/全データなし）は面塗りを出さず輪郭線のみ＝形は先に見える。
  // scale は指標定義から（未知 metric は安全側で sequential）。逐次ランプは色相体系（`ADR-0032`）から解決
  // ＝緑/相場・紫/将来・灰/基盤（発散は buildFillLayer 内で PRGn 固定ゆえ ramp は使われない）。
  const scale = def?.scale ?? "sequential";
  const ramp = sequentialFillRamp(def);
  const fillLayer = range ? buildFillLayer(range.min, range.max, scale, ramp) : null;

  return (
    // feature.id は geometry API が5桁コードを付与済み（文字列トップレベル id）。MapLibre はこれを
    // feature-state の結合に使える（実機で確認済＝色分けが効いていた）。promoteId は付けない。
    <Source id={SOURCE_ID} type="geojson" data={geometry}>
      {/* データ塗り（下）→ 非該当沈めスクリム → ホバー面オーバーレイ → 通常輪郭 → 該当縁(コーラル) →
          ホバー輪郭 → 選択輪郭(コーラル太・上) の順。序列：選択(確定) > ホバー(一時) > 該当(絞り込み) > 通常。
          スクリムはホバー面より下＝ホバーの合図が沈めに埋もれない。該当縁はホバー/選択より下＝
          該当区を触る/選ぶとホバー/選択が勝つ。絞り込み非作動時はスクリム/該当縁とも幅・不透明度0で不可視。 */}
      {fillLayer && <Layer {...fillLayer} />}
      <Layer {...dimFillLayer} />
      <Layer {...hoverFillLayer} />
      <Layer {...outlineLayer} />
      <Layer {...matchedLayer} />
      <Layer {...hoverLayer} />
      <Layer {...selectedLayer} />
    </Source>
  );
}
