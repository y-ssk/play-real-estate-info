import type { ChoroplethGeometry } from "./choropleth";
import { fetchChoroplethGeometry } from "./choropleth";

/** 1区だけの最小 FeatureCollection（形のみ・値なし＝ADR-0016）。 */
const sampleGeometry: ChoroplethGeometry = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "13104",
      properties: { code: "13104", name: "新宿区" },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [139.7, 35.69],
              [139.71, 35.69],
              [139.71, 35.7],
              [139.7, 35.69],
            ],
          ],
        ],
      },
    },
  ],
};

/**
 * fetch を最小の応答ライク値で差し替える（jsdom は fetch/Response を持たない）。
 * 本番コードが触るのは ok/status/json のみ＝そこだけ満たせば結線の検証に足りる。
 */
function stubFetch(response: { ok: boolean; status: number; body?: unknown }): jest.Mock {
  const mock = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe("fetchChoroplethGeometry", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("成功時に GeoJSON FeatureCollection を相対パスから返す（dev は :8080 へプロキシ）", async () => {
    const mock = stubFetch({ ok: true, status: 200, body: sampleGeometry });

    const result = await fetchChoroplethGeometry();

    expect(mock).toHaveBeenCalledWith("/api/choropleth/geometry");
    expect(result.type).toBe("FeatureCollection");
    // feature.id（5桁コード）と properties.code が一致＝塗りの結合キー前提（ADR-0016）。
    expect(result.features[0]?.id).toBe("13104");
    expect(result.features[0]?.properties.code).toBe("13104");
    expect(result.features[0]?.properties.name).toBe("新宿区");
  });

  it("HTTP エラー時は投げる（Query の error 経路へ渡す）", async () => {
    stubFetch({ ok: false, status: 500 });

    await expect(fetchChoroplethGeometry()).rejects.toThrow("HTTP 500");
  });
});
