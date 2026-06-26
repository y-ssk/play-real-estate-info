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
