import type { MetricValue } from "./values";
import { fetchMetricValues } from "./values";

/** present/該当なし0/none/suppressed の4種を含む応答（データなし3区別・ADR-0011）。 */
const sampleValues: MetricValue[] = [
  { code: "13101", value: 11.64, status: "present" },
  { code: "13102", value: 0, status: "present" }, // 該当なし=0
  { code: "13103", value: null, status: "none" }, // データなし
  { code: "13104", value: null, status: "suppressed" }, // 秘匿
];

function stubFetch(response: { ok: boolean; status: number; body?: unknown }): jest.Mock {
  const mock = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe("fetchMetricValues", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("metric をクエリに載せて相対パスから取得する（dev は :8080 へプロキシ）", async () => {
    const mock = stubFetch({ ok: true, status: 200, body: sampleValues });

    const result = await fetchMetricValues("area_km2");

    expect(mock).toHaveBeenCalledWith("/api/choropleth/values?metric=area_km2");
    // データなし3区別が型のまま運ばれること（value:null と status の組）。
    expect(result[0]).toEqual({ code: "13101", value: 11.64, status: "present" });
    expect(result[1]?.value).toBe(0); // 該当なし=0 は null でなく 0
    expect(result[2]).toEqual({ code: "13103", value: null, status: "none" });
    expect(result[3]?.status).toBe("suppressed");
  });

  it("metric を URL エンコードする（特殊文字の混入対策）", async () => {
    const mock = stubFetch({ ok: true, status: 200, body: [] });

    await fetchMetricValues("a b/c");

    expect(mock).toHaveBeenCalledWith("/api/choropleth/values?metric=a%20b%2Fc");
  });

  it("HTTP エラー時は投げる（Query の error 経路へ渡す）", async () => {
    stubFetch({ ok: false, status: 500 });

    await expect(fetchMetricValues("area_km2")).rejects.toThrow("HTTP 500");
  });
});
