import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ChoroplethGeometry } from "../../lib/choropleth";
import { createQueryClient } from "../../lib/queryClient";
import type { MetricValue } from "../../lib/values";
import { CHOROPLETH_OUTLINE_COLOR } from "../../styles/mapTokens";
import { ChoroplethLayer } from "./ChoroplethLayer";

// setFeatureState/removeFeatureState の呼び出しを記録する偽 map（WebGL を持たない jsdom 用）。
// on/off/getCanvas はホバー購読（スライス3.6）が呼ぶため最小スタブを足す（イベント自体の発火は
// 地図エンジン依存ゆえ jsdom では検証せず層4目視に委ねる）。
const featureStateCalls: Array<{ id: string | number; state: Record<string, unknown> }> = [];
const removeStateCalls: number[] = [];
const fakeCanvas = { style: { cursor: "" } } as HTMLCanvasElement;
const fakeMap = {
  setFeatureState: (target: { id: string | number }, state: Record<string, unknown>) => {
    featureStateCalls.push({ id: target.id, state });
  },
  removeFeatureState: () => {
    removeStateCalls.push(1);
  },
  on: () => {},
  off: () => {},
  getCanvas: () => fakeCanvas,
};

// react-map-gl/maplibre の Source/Layer/useMap を検査可能な DOM/スタブへ差し替える。
jest.mock("react-map-gl/maplibre", () => ({
  useMap: () => ({ current: { getMap: () => fakeMap } }),
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
      data-testid={`layer-${type}`}
      data-id={id}
      data-type={type}
      data-source={source}
      data-line-color={String(paint["line-color"])}
      data-fill-opacity={JSON.stringify(paint["fill-opacity"])}
    />
  ),
}));

const sampleGeometry: ChoroplethGeometry = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "13101",
      properties: { code: "13101", name: "千代田区" },
      geometry: { type: "MultiPolygon", coordinates: [] },
    },
    {
      type: "Feature",
      id: "13102",
      properties: { code: "13102", name: "中央区" },
      geometry: { type: "MultiPolygon", coordinates: [] },
    },
  ],
};

const sampleValues: MetricValue[] = [
  { code: "13101", value: 11.64, status: "present" },
  { code: "13102", value: null, status: "none" }, // データなし＝state を張らない＝色抜き
];

// パス別に応答を返す fetch スタブ（geometry と values の2系統）。
function stubFetch(geometry: unknown, values: unknown): void {
  globalThis.fetch = jest.fn().mockImplementation((url: string) => {
    const body = url.startsWith("/api/choropleth/values") ? values : geometry;
    return Promise.resolve({ ok: true, status: 200, json: async () => body });
  }) as unknown as typeof fetch;
}

function renderWithClient(ui: ReactNode) {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("ChoroplethLayer", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    featureStateCalls.length = 0;
    removeStateCalls.length = 0;
  });

  it("形と値がそろうと fill と line を構成し、present だけに setFeatureState する", async () => {
    stubFetch(sampleGeometry, sampleValues);

    renderWithClient(<ChoroplethLayer />);

    // データ面塗りレイヤーが出る（値域がある＝present の値がある）。ホバー面オーバーレイも type=fill ゆえ
    // testid が同じ（layer-fill）＝データ塗りは id（choropleth-fill）で特定する（ホバー面は別 id）。
    await screen.findAllByTestId("layer-fill");
    const fills = screen.getAllByTestId("layer-fill");
    const fill = fills.find((el) => el.getAttribute("data-id") === "choropleth-fill");
    expect(fill).toBeDefined();
    expect(fill).toHaveAttribute("data-source", "choropleth");
    // 輪郭線は残る（区界を読ませる線・死守）。通常輪郭＋選択強調の2本の line があるため、
    // 通常輪郭は id で特定する（選択強調は別 id・選択時のみ太くなる）。
    const lines = screen.getAllByTestId("layer-line");
    const line = lines.find((el) => el.getAttribute("data-id") === "choropleth-outline");
    expect(line).toBeDefined();
    expect(line).toHaveAttribute("data-line-color", CHOROPLETH_OUTLINE_COLOR);

    // fill-opacity は色抜きの case 式（present フラグが真の時だけ不透明）。
    const op = JSON.parse(fill?.getAttribute("data-fill-opacity") ?? "null");
    expect(op[0]).toBe("case");
    expect(op[1]).toEqual(["==", ["feature-state", "present"], true]);

    // present(13101) にだけ value+present が張られ、データなし(13102)には張られない＝色抜き。
    await waitFor(() => {
      expect(featureStateCalls).toHaveLength(1);
    });
    expect(featureStateCalls[0]).toEqual({ id: "13101", state: { value: 11.64, present: true } });
    // 張り直し前に一旦消す（指標切替・持ち越し防止）。
    expect(removeStateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("取得前は source を出さない（基図のみ＝描画を壊さない）", () => {
    globalThis.fetch = jest.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;

    renderWithClient(<ChoroplethLayer />);

    expect(screen.queryByTestId("source")).toBeNull();
  });

  it("形だけ来て値が無い間は輪郭線のみ（面塗りは出さない）", async () => {
    // values は永久ペンディング、geometry だけ解決。
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/choropleth/values")) {
        return new Promise(() => {});
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => sampleGeometry });
    }) as unknown as typeof fetch;

    renderWithClient(<ChoroplethLayer />);

    // 輪郭線は出るが「データ面塗り」は出ない（値域が無いため）。ホバー面オーバーレイ（別 id・常設）は
    // type=fill ゆえ layer-fill に含まれるため、データ塗りは id（choropleth-fill）の不在で確かめる。
    await screen.findAllByTestId("layer-line");
    const dataFill = screen
      .queryAllByTestId("layer-fill")
      .find((el) => el.getAttribute("data-id") === "choropleth-fill");
    expect(dataFill).toBeUndefined();
  });
});
