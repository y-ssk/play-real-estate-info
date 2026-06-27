import {
  CHOROPLETH_DIVERGING_RAMP,
  CHOROPLETH_FILL_RAMP,
  choroplethFillColor,
  choroplethFillLegend,
  divergingFillColor,
  divergingFillLegend,
} from "./mapTokens";

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
