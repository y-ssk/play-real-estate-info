import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ChoroplethGeometry } from "../../lib/choropleth";
import { createQueryClient } from "../../lib/queryClient";
import type { MetricValue } from "../../lib/values";
import { CHOROPLETH_OUTLINE_COLOR } from "../../styles/mapTokens";
import { ChoroplethLayer } from "./ChoroplethLayer";

// setFeatureState/removeFeatureState の呼び出しを記録する偽 map（WebGL を持たない jsdom 用）。
const featureStateCalls: Array<{ id: string | number; state: Record<string, unknown> }> = [];
const removeStateCalls: number[] = [];
const fakeMap = {
  setFeatureState: (target: { id: string | number }, state: Record<string, unknown>) => {
    featureStateCalls.push({ id: target.id, state });
  },
  removeFeatureState: () => {
    removeStateCalls.push(1);
  },
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

    // 面塗りレイヤーが出る（値域がある＝present の値がある）。
    const fill = await screen.findByTestId("layer-fill");
    expect(fill).toHaveAttribute("data-source", "choropleth");
    // 輪郭線は残る（区界を読ませる線・死守）。通常輪郭＋選択強調の2本の line があるため、
    // 通常輪郭は id で特定する（選択強調は別 id・選択時のみ太くなる）。
    const lines = screen.getAllByTestId("layer-line");
    const line = lines.find((el) => el.getAttribute("data-id") === "choropleth-outline");
    expect(line).toBeDefined();
    expect(line).toHaveAttribute("data-line-color", CHOROPLETH_OUTLINE_COLOR);

    // fill-opacity は色抜きの case 式（present フラグが真の時だけ不透明）。
    const op = JSON.parse(fill.getAttribute("data-fill-opacity") ?? "null");
    expect(op[0]).toBe("case");
    expect(op[1]).toEqual(["==", ["feature-state", "present"], true]);

    // present(13101) にだけ value+present が張られ、データなし(13102)には張られない＝色抜き。
    // 値の effect とは別に matched の effect も present に matched を張る（絞り込み未使用＝全件 true）ため、
    // 「value+present を持つ呼び出し」だけを取り出して検証する（matched 呼び出しは別アサート）。
    await waitFor(() => {
      expect(featureStateCalls.some((c) => "present" in c.state)).toBe(true);
    });
    const valueCalls = featureStateCalls.filter((c) => "present" in c.state);
    expect(valueCalls).toHaveLength(1);
    expect(valueCalls[0]).toEqual({ id: "13101", state: { value: 11.64, present: true } });
    // 絞り込み未使用時は present(13101) に matched:true を張る＝全件通常塗り（従来の見え方を壊さない）。
    const matchedCalls = featureStateCalls.filter((c) => "matched" in c.state);
    expect(matchedCalls).toEqual([{ id: "13101", state: { matched: true } }]);
    // 張り直し前に一旦消す（指標切替・持ち越し防止）。
    expect(removeStateCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("絞り込み中は該当に matched:true・非該当に matched:false を張り、不透明度式を強調側へ切り替える", async () => {
    // 両方 present・値ありにして「該当/非該当」の差を matched で表せるようにする。
    const values: MetricValue[] = [
      { code: "13101", value: 11.64, status: "present" },
      { code: "13102", value: 10.2, status: "present" },
    ];
    stubFetch(sampleGeometry, values);

    renderWithClient(<ChoroplethLayer filterActive={true} matchedCodes={new Set(["13101"])} />);

    const fill = await screen.findByTestId("layer-fill");
    // 強調時は matched を見る case 式（present の分岐を含む3状態）へ切り替わる。
    const op = JSON.parse(fill.getAttribute("data-fill-opacity") ?? "null");
    expect(op[0]).toBe("case");
    const flat = JSON.stringify(op);
    expect(flat).toContain("matched");

    await waitFor(() => {
      expect(featureStateCalls.some((c) => "matched" in c.state)).toBe(true);
    });
    const matchedCalls = featureStateCalls.filter((c) => "matched" in c.state);
    // 該当(13101)=true、非該当(13102)=false（淡く沈める）。
    expect(matchedCalls).toContainEqual({ id: "13101", state: { matched: true } });
    expect(matchedCalls).toContainEqual({ id: "13102", state: { matched: false } });
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

    // 輪郭線は出るが面塗りは出ない（値域が無いため）。通常輪郭＋選択強調で line は2本。
    await screen.findAllByTestId("layer-line");
    expect(screen.queryByTestId("layer-fill")).toBeNull();
  });
});
