import { createPropertyExpression } from "@maplibre/maplibre-gl-style-spec";
import {
  CHOROPLETH_DIM_FILL_OPACITY_EXPR,
  CHOROPLETH_DIVERGING_RAMP,
  CHOROPLETH_FILL_OPACITY_EXPR,
  CHOROPLETH_FILL_RAMP,
  CHOROPLETH_HOVER_FILL_OPACITY_EXPR,
  CHOROPLETH_HOVER_OUTLINE_WIDTH,
  CHOROPLETH_MATCHED_OUTLINE_WIDTH,
  CHOROPLETH_OUTLINE_WIDTH,
  CHOROPLETH_SELECTED_OUTLINE_WIDTH,
  choroplethFillColor,
  choroplethFillLegend,
  divergingFillColor,
  divergingFillLegend,
} from "./mapTokens";

// 輪郭幅の式から各ズーム基準点の幅を取り出す小道具。式は最上位 interpolate(zoom) で
// （["interpolate",["linear"],["zoom"], z0,out0, z1,out1, ...]）、各 stop の出力は
// 数値（通常輪郭）か ["case", 条件, 幅, 0]（ホバー/選択＝feature-state 分岐）。
function widthAtZoom(expr: unknown, zoom: number): number {
  const interp = expr as unknown[];
  const stops = interp.slice(3); // [z0,out0, z1,out1, ...]
  for (let i = 0; i < stops.length; i += 2) {
    if (stops[i] === zoom) {
      const out = stops[i + 1];
      // 出力が ["case", cond, 幅, 0] なら「真のときの幅」＝3要素目。数値ならそのまま。
      return (Array.isArray(out) ? out[2] : out) as number;
    }
  }
  throw new Error(`zoom ${zoom} の基準点が式に無い`);
}

// data-driven・zoom/feature で interpolate 可の property spec。line-width/fill-opacity=number、
// fill-color=color と、検証する paint プロパティの型に合わせて使い分ける（型不一致も式バリデータが弾く）。
const numberSpec = {
  type: "number",
  "property-type": "data-driven",
  expression: { interpolated: true, parameters: ["zoom", "feature"] },
} as const;
const colorSpec = {
  type: "color",
  "property-type": "data-driven",
  expression: { interpolated: true, parameters: ["zoom", "feature"] },
} as const;

// MapLibre の式バリデータで「実際に有効か」を検証する（jsdom では地図が動かず層4 でしか
// 出ないバグ＝無効な paint 式を、ブラウザなしで層2 で捕まえる）。
// 真因だった「zoom 入力の interpolate を case に入れ子」は createPropertyExpression が error を返す。
function assertValid(
  name: string,
  expr: unknown,
  spec: typeof numberSpec | typeof colorSpec,
): void {
  // biome-ignore lint/suspicious/noExplicitAny: style-spec の型は緩く、検証用に式・spec を渡すため any 受け。
  const r = createPropertyExpression(expr as any, spec as any);
  if (r.result !== "success") {
    const msgs = r.value.map((e) => e.message).join(" / ");
    throw new Error(`${name} は MapLibre 式として無効: ${msgs}`);
  }
}

describe("choroplethFillColor", () => {
  it("値域 [min,max] を5段ランプへ等間隔で写す（凡例と同じ stops）", () => {
    const expr = choroplethFillColor(0, 100) as unknown[];
    // ["interpolate", ["linear"], ["feature-state","value"], b0,c0, b1,c1, ...]
    expect(expr[0]).toBe("interpolate");
    expect(expr[2]).toEqual(["feature-state", "value"]);

    const stops = expr.slice(3);
    // 5段＝10要素（境界・色の対）。
    expect(stops).toHaveLength(CHOROPLETH_FILL_RAMP.length * 2);
    // 先頭境界=min・末尾色=最濃。
    expect(stops[0]).toBe(0);
    expect(stops[1]).toBe(CHOROPLETH_FILL_RAMP[0]);
    expect(stops[8]).toBe(100);
    expect(stops[9]).toBe(CHOROPLETH_FILL_RAMP[4]);
  });

  it("min==max（全単位同値）でも潰れず式を返す（ゼロ幅回避）", () => {
    const expr = choroplethFillColor(50, 50) as unknown[];
    const stops = expr.slice(3);
    // 幅1で展開＝境界が単調増加（同値連発で interpolate が壊れない）。
    expect(stops[0]).toBe(50);
    expect(stops[8]).toBe(51);
  });
});

describe("choroplethFillLegend", () => {
  it("色段と下限値を返し、ランプと同順・同色（地図と一致）", () => {
    const legend = choroplethFillLegend(10, 90);
    expect(legend).toHaveLength(CHOROPLETH_FILL_RAMP.length);
    expect(legend[0]).toEqual({ color: CHOROPLETH_FILL_RAMP[0], lowerBound: 10 });
    expect(legend[4]?.lowerBound).toBe(90);
    expect(legend.map((s) => s.color)).toEqual([...CHOROPLETH_FILL_RAMP]);
  });
});

describe("divergingFillColor", () => {
  it("0 を視覚中心に固定（中央段の境界が0・対称ドメイン）", () => {
    // min=-0.1, max=0.25 → bound=max(|−0.1|,|0.25|)=0.25。domain=[-0.25,+0.25]、中央(=index2)が0。
    const expr = divergingFillColor(-0.1, 0.25) as unknown[];
    expect(expr[0]).toBe("interpolate");
    expect(expr[2]).toEqual(["feature-state", "value"]);
    const stops = expr.slice(3);
    expect(stops).toHaveLength(CHOROPLETH_DIVERGING_RAMP.length * 2);
    // index0 境界=-bound, index2(中央)=0, index4=+bound。
    expect(stops[0]).toBeCloseTo(-0.25, 10);
    expect(stops[4]).toBeCloseTo(0, 10); // 3組目の境界（中央）
    expect(stops[5]).toBe(CHOROPLETH_DIVERGING_RAMP[2]); // 中央色
    expect(stops[8]).toBeCloseTo(0.25, 10);
  });

  it("すべて0/同値でも潰れず式を返す（ゼロ幅回避）", () => {
    const expr = divergingFillColor(0, 0) as unknown[];
    const stops = expr.slice(3);
    // bound=1 にフォールバックし境界が単調増加（interpolate が壊れない）。
    expect(stops[0]).toBe(-1);
    expect(stops[8]).toBe(1);
  });
});

describe("輪郭幅の序列（通常 < ホバー < 選択・各ズームで保たれる）", () => {
  // 旧実装はホバー固定2pxで拡大時に通常線へ負けた（層4 目視）。ズーム連動で常に上回ることを担保する。
  it.each([9, 12, 15, 17])("ズーム%iでホバーは通常を1.5px以上上回り、選択はホバーより太い", (z) => {
    const normal = widthAtZoom(CHOROPLETH_OUTLINE_WIDTH, z);
    const hover = widthAtZoom(CHOROPLETH_HOVER_OUTLINE_WIDTH, z);
    const selected = widthAtZoom(CHOROPLETH_SELECTED_OUTLINE_WIDTH, z);
    expect(hover).toBeGreaterThanOrEqual(normal + 1.5);
    expect(selected).toBeGreaterThan(hover);
  });
});

describe("絞り込み該当輪郭の序列（通常 < 該当 < ホバー・各ズーム）", () => {
  // 該当(matched)は通常線より太く気付かせるが、ホバー/選択（一時操作・確定）には譲る（ADR-0028 チャネル序列）。
  it.each([9, 12, 15, 17])("ズーム%iで該当は通常より太く、ホバーより細い", (z) => {
    const normal = widthAtZoom(CHOROPLETH_OUTLINE_WIDTH, z);
    const matched = widthAtZoom(CHOROPLETH_MATCHED_OUTLINE_WIDTH, z);
    const hover = widthAtZoom(CHOROPLETH_HOVER_OUTLINE_WIDTH, z);
    expect(matched).toBeGreaterThan(normal);
    expect(matched).toBeLessThan(hover);
  });
});

describe("地図 paint 式が MapLibre 式として有効（層4 でしか出ない無効式を層2 で捕まえる）", () => {
  // 真因の再発防止：zoom 入力の interpolate を case 等に入れ子にすると MapLibre が無効と判定し
  // レイヤーごと描画されない（層4＝実機でしか露見しなかった）。createPropertyExpression で層2 で検証する。
  it.each([
    ["CHOROPLETH_OUTLINE_WIDTH", CHOROPLETH_OUTLINE_WIDTH],
    ["CHOROPLETH_HOVER_OUTLINE_WIDTH", CHOROPLETH_HOVER_OUTLINE_WIDTH],
    ["CHOROPLETH_SELECTED_OUTLINE_WIDTH", CHOROPLETH_SELECTED_OUTLINE_WIDTH],
    ["CHOROPLETH_MATCHED_OUTLINE_WIDTH", CHOROPLETH_MATCHED_OUTLINE_WIDTH],
    ["CHOROPLETH_FILL_OPACITY_EXPR", CHOROPLETH_FILL_OPACITY_EXPR],
    ["CHOROPLETH_HOVER_FILL_OPACITY_EXPR", CHOROPLETH_HOVER_FILL_OPACITY_EXPR],
    ["CHOROPLETH_DIM_FILL_OPACITY_EXPR", CHOROPLETH_DIM_FILL_OPACITY_EXPR],
  ])("%s（number paint）は有効な式", (name, expr) => {
    expect(() => assertValid(name, expr, numberSpec)).not.toThrow();
  });

  it.each([
    ["choroplethFillColor", choroplethFillColor(0, 100)],
    ["divergingFillColor", divergingFillColor(-0.1, 0.2)],
  ])("%s（color paint）は有効な式", (name, expr) => {
    expect(() => assertValid(name, expr, colorSpec)).not.toThrow();
  });
});

describe("divergingFillLegend", () => {
  it("中央0を境に対称な色段（地図の色式と同じ stops＝一致）", () => {
    const legend = divergingFillLegend(-0.08, 0.2);
    expect(legend).toHaveLength(CHOROPLETH_DIVERGING_RAMP.length);
    expect(legend.map((s) => s.color)).toEqual([...CHOROPLETH_DIVERGING_RAMP]);
    // bound=0.2、中央(index2)=0。
    expect(legend[0]?.lowerBound).toBeCloseTo(-0.2, 10);
    expect(legend[2]?.lowerBound).toBeCloseTo(0, 10);
    expect(legend[4]?.lowerBound).toBeCloseTo(0.2, 10);
  });
});
