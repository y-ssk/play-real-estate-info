import { DEFAULT_METRIC, METRICS, METRIC_ORDER } from "./metrics";

describe("METRICS registry", () => {
  it("トグルの並び（METRIC_ORDER）は全て registry に存在する", () => {
    for (const key of METRIC_ORDER) {
      expect(METRICS[key]).toBeDefined();
      expect(METRICS[key]?.key).toBe(key);
    }
  });

  it("既定指標は registry に存在する", () => {
    expect(METRICS[DEFAULT_METRIC]).toBeDefined();
  });

  it("面積は sequential、人口増減率は diverging（配色方式の振り分け）", () => {
    expect(METRICS.area_km2?.scale).toBe("sequential");
    expect(METRICS.pop_change_rate_2020_2050?.scale).toBe("diverging");
  });

  it("人口増減率の出典に「推計」が明記される（ADR-0009 断定しない）", () => {
    expect(METRICS.pop_change_rate_2020_2050?.source).toContain("推計");
  });

  it("地価中央値は sequential・単位 円/㎡・出典に XPT002/住宅地が明記（ADR-0008/0011）", () => {
    const def = METRICS.land_price_median;
    expect(def?.scale).toBe("sequential");
    expect(def?.unit).toBe("円/㎡");
    expect(def?.source).toContain("XPT002");
    expect(def?.source).toContain("住宅地");
  });
});

describe("地価中央値の整形（整数・桁区切り）", () => {
  const fmt = METRICS.land_price_median?.format;

  it("大きな整数をカンマ区切りにする（単位は凡例側で付与）", () => {
    expect(fmt?.(1210000)).toBe("1,210,000");
    expect(fmt?.(550000)).toBe("550,000");
  });

  it("小数は四捨五入して整数で示す（中央値が偶数個で .5 になり得る）", () => {
    expect(fmt?.(1000000.5)).toBe("1,000,001");
  });
});

describe("増減率の整形（符号付き%・小数1桁）", () => {
  const fmt = METRICS.pop_change_rate_2020_2050?.format;

  it("正は + 付き", () => {
    expect(fmt?.(0.15)).toBe("+15.0%");
    expect(fmt?.(0.247)).toBe("+24.7%");
  });

  it("負は - 付き（toLocaleString が符号）", () => {
    expect(fmt?.(-0.08)).toBe("-8.0%");
  });

  it("0 は無印", () => {
    expect(fmt?.(0)).toBe("0.0%");
  });
});
