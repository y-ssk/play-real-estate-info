import {
  CHOROPLETH_FILL_RAMP,
  CHOROPLETH_FILL_RAMP_GREY,
  CHOROPLETH_FILL_RAMP_PURPLE,
} from "../../styles/mapTokens";
import { DEFAULT_METRIC, METRICS, METRIC_ORDER, sequentialFillRamp } from "./metrics";

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

  it("高齢化率は sequential・出典に XKT013 と「推計」が明記（ADR-0009 断定しない）", () => {
    const def = METRICS.aging_rate_2050;
    expect(def?.scale).toBe("sequential");
    expect(def?.source).toContain("XKT013");
    expect(def?.source).toContain("推計");
  });

  it("地価中央値は sequential・単位 円/㎡・出典に XPT002/住宅地が明記（ADR-0008/0011）", () => {
    const def = METRICS.land_price_median;
    expect(def?.scale).toBe("sequential");
    expect(def?.unit).toBe("円/㎡");
    expect(def?.source).toContain("XPT002");
    expect(def?.source).toContain("住宅地");
  });
});

describe("面塗り指標の色相体系（ADR-0032・分野で色相を束ねる）", () => {
  it("逐次指標は分野色相を持つ：面積=灰・地価=緑・高齢化=紫（緑独占の解消）", () => {
    const area = METRICS.area_km2;
    const land = METRICS.land_price_median;
    const aging = METRICS.aging_rate_2050;
    // 判別ユニオンゆえ sequential のときだけ hue にアクセスできる（型で保証）。
    expect(area?.scale === "sequential" && area.hue).toBe("grey");
    expect(land?.scale === "sequential" && land.hue).toBe("green");
    expect(aging?.scale === "sequential" && aging.hue).toBe("purple");
  });

  it("発散指標（人口増減率）は色相を持たない（0中央 PRGn 固定）", () => {
    const pop = METRICS.pop_change_rate_2020_2050;
    expect(pop?.scale).toBe("diverging");
    // diverging には hue キーが無い（型でも実データでも）。
    expect(pop && "hue" in pop).toBe(false);
  });

  it("全ての sequential 指標が色相を持つ＝体系から外れられない（新指標も型で強制）", () => {
    for (const def of Object.values(METRICS)) {
      if (def.scale === "sequential") {
        expect(["green", "purple", "grey"]).toContain(def.hue);
      }
    }
  });

  it("sequentialFillRamp は色相→ランプの対応を返す（Layer/Legend 共通の1窓口）", () => {
    expect(sequentialFillRamp(METRICS.area_km2)).toEqual(CHOROPLETH_FILL_RAMP_GREY);
    expect(sequentialFillRamp(METRICS.land_price_median)).toEqual(CHOROPLETH_FILL_RAMP);
    expect(sequentialFillRamp(METRICS.aging_rate_2050)).toEqual(CHOROPLETH_FILL_RAMP_PURPLE);
    // 未知/未定義 metric は安全側で緑ランプ（後方互換）。
    expect(sequentialFillRamp(undefined)).toEqual(CHOROPLETH_FILL_RAMP);
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

describe("高齢化率の整形（符号なし%・小数1桁）", () => {
  const fmt = METRICS.aging_rate_2050?.format;

  it("非負の比率を + 符号なしで % 表示する（増減率と違い符号を付けない）", () => {
    expect(fmt?.(0.35)).toBe("35.0%");
    expect(fmt?.(0.207)).toBe("20.7%");
  });

  it("0 は 0.0%（小数1桁固定）", () => {
    expect(fmt?.(0)).toBe("0.0%");
  });
});
