import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ChoroplethGeometry } from "../../lib/choropleth";
import { createQueryClient } from "../../lib/queryClient";
import { ChoroplethLayer } from "./ChoroplethLayer";

// react-map-gl/maplibre の Source/Layer は Map コンテキスト（WebGL）を要するため、
// 結線（どの props で構成されるか）だけを検証できるよう検査可能な DOM に差し替える。
jest.mock("react-map-gl/maplibre", () => ({
  Source: ({
    id,
    type,
    data,
    children,
  }: { id: string; type: string; data: unknown; children?: ReactNode }) => (
    <div
      data-testid="source"
      data-id={id}
      data-type={type}
      data-has-data={data !== undefined ? "yes" : "no"}
    >
      {children}
    </div>
  ),
  Layer: ({
    id,
    type,
    source,
    paint,
  }: { id: string; type: string; source: string; paint: Record<string, unknown> }) => (
    <div
      data-testid="layer"
      data-id={id}
      data-type={type}
      data-source={source}
      data-line-color={String(paint["line-color"])}
      data-line-width={String(paint["line-width"])}
    />
  ),
}));

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
function stubFetch(response: { ok: boolean; status: number; body?: unknown }): void {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  }) as unknown as typeof fetch;
}

function renderWithClient(ui: ReactNode) {
  // テストごとに新規クライアント＝キャッシュ汚染を避ける（lib/queryClient の意図）。
  // 再試行を止める＝失敗の確定を即座にし、テストを速く/安定させる（本番は既定の再試行）。
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("ChoroplethLayer", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("取得成功で geojson source と line layer を構成する", async () => {
    stubFetch({ ok: true, status: 200, body: sampleGeometry });

    renderWithClient(<ChoroplethLayer />);

    const source = await screen.findByTestId("source");
    expect(source).toHaveAttribute("data-type", "geojson");
    expect(source).toHaveAttribute("data-id", "choropleth");
    expect(source).toHaveAttribute("data-has-data", "yes");

    const layer = screen.getByTestId("layer");
    expect(layer).toHaveAttribute("data-type", "line");
    // Layer の source は Source の id と一致＝MapLibre の結線が成立する。
    expect(layer).toHaveAttribute("data-source", "choropleth");
    // 色・太さはトークン由来（生値直書きしない＝DESIGN §4）。スレート系の境界色。
    expect(layer).toHaveAttribute("data-line-color", "#94a3b8");
    expect(layer).toHaveAttribute("data-line-width", "1");
  });

  it("取得前は source を出さない（基図のみ＝描画を壊さない）", () => {
    // 永久に解決しない fetch でローディング状態を再現。
    globalThis.fetch = jest.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;

    renderWithClient(<ChoroplethLayer />);

    expect(screen.queryByTestId("source")).toBeNull();
    expect(screen.queryByTestId("layer")).toBeNull();
  });

  it("取得失敗でも落ちず source を出さない（基図を保つ）", async () => {
    stubFetch({ ok: false, status: 500 });

    renderWithClient(<ChoroplethLayer />);

    // 失敗が確定するまで待ち、その間も例外で落ちないこと・source 非表示を確認。
    await waitFor(() => {
      expect(screen.queryByTestId("source")).toBeNull();
    });
    expect(screen.queryByTestId("layer")).toBeNull();
  });
});
