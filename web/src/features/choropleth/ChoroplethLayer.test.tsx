import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ChoroplethGeometry } from "../../lib/choropleth";
import { createQueryClient } from "../../lib/queryClient";
import { useSelectionStore } from "../../lib/selection";
import type { MetricValue } from "../../lib/values";
import { CHOROPLETH_OUTLINE_COLOR } from "../../styles/mapTokens";
import { ChoroplethLayer } from "./ChoroplethLayer";

// setFeatureState/removeFeatureState の呼び出しを記録する偽 map（WebGL を持たない jsdom 用）。
// on/off/getCanvas はホバー購読（スライス3.6）が呼ぶため最小スタブを足す（イベント自体の発火は
// 地図エンジン依存ゆえ jsdom では検証せず層4目視に委ねる）。
const featureStateCalls: Array<{ id: string | number; state: Record<string, unknown> }> = [];
const removeStateCalls: number[] = [];
// removeFeatureState の引数（target.id・消すキー）を記録する＝matched の後始末（per-feature の
// removeFeatureState(...,"matched")）を検証するため。source 一掃（id 無し・key 無し）と区別できる。
const removeStateArgs: Array<{ id?: string | number; key?: string }> = [];
// setFeatureState/removeFeatureState を1本の時系列に並べて記録する（指標切替で source の全 state を
// 消した「後」に hover/selected が張り直されるか＝順序依存の退行を検知するため）。
type StateEvent =
  | { kind: "set"; id: string | number; state: Record<string, unknown> }
  | { kind: "remove" };
const stateLog: StateEvent[] = [];
const fakeCanvas = { style: { cursor: "" } } as HTMLCanvasElement;
const fakeMap = {
  setFeatureState: (target: { id: string | number }, state: Record<string, unknown>) => {
    featureStateCalls.push({ id: target.id, state });
    stateLog.push({ kind: "set", id: target.id, state });
  },
  removeFeatureState: (target?: { id?: string | number }, key?: string) => {
    removeStateCalls.push(1);
    removeStateArgs.push({ id: target?.id, key });
    stateLog.push({ kind: "remove" });
  },
  on: () => {},
  off: () => {},
  getCanvas: () => fakeCanvas,
  // source 存在ガード（feature-state は source 未生成だと MapLibre が例外を投げる）。既定は「生成済み」を返し
  // 既存の張り替え検証を保つ。未生成ケースは getSource を差し替えて検証する（下のガード退行テスト）。
  getSource: () => ({}) as unknown,
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
  beforeEach(() => {
    // 選択状態（Zustand）はモジュール横断で持続するためテスト間で初期化する。RTL の自動 cleanup で
    // 前テストの component が unmount された後（次テスト開始前）に戻す＝マウント中に store を触って
    // act 外更新の警告を出さない。
    useSelectionStore.setState({ selectedUnit: null });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    featureStateCalls.length = 0;
    removeStateCalls.length = 0;
    removeStateArgs.length = 0;
    stateLog.length = 0;
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

  // --- スライス3.6 の本丸：ホバー/選択の feature-state 張り替え（描画の鏡・frontend-conventions §3） ---

  it("(a) hoveredId を渡すと該当 feature に {hover:true} を張る", async () => {
    stubFetch(sampleGeometry, sampleValues);

    renderWithClient(<ChoroplethLayer hoveredId="13102" />);

    // ホバー effect は geometry がそろってから走る＝非同期に張られるのを待つ。
    await waitFor(() => {
      expect(featureStateCalls.some((c) => c.id === "13102" && c.state.hover === true)).toBe(true);
    });
    // 他 feature にホバーは張られない（乗っている1区だけ反応）。
    expect(featureStateCalls.some((c) => c.id === "13101" && c.state.hover === true)).toBe(false);
  });

  it("(b) selectedUnit を立てると該当 feature に {selected:true} を張る", async () => {
    stubFetch(sampleGeometry, sampleValues);
    // 状態の真実は store（描画はその鏡）。選択を立ててから描画する。
    useSelectionStore.setState({ selectedUnit: { unitKind: "municipality", unitId: "13101" } });

    renderWithClient(<ChoroplethLayer />);

    await waitFor(() => {
      expect(featureStateCalls.some((c) => c.id === "13101" && c.state.selected === true)).toBe(
        true,
      );
    });
  });

  it("(c) values 差し替え（removeFeatureState で source 一掃）後に selected が張り直される", async () => {
    // metric ごとに別の値を返す（指標切替で query が再走＝values が差し替わる状況を作る）。
    const valuesByMetric: Record<string, MetricValue[]> = {
      area_km2: [{ code: "13101", value: 11.64, status: "present" }],
      pop_change_rate_2020_2050: [{ code: "13101", value: -0.08, status: "present" }],
    };
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/choropleth/values")) {
        const metric = new URL(url, "http://x").searchParams.get("metric") ?? "area_km2";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => valuesByMetric[metric] ?? [],
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => sampleGeometry });
    }) as unknown as typeof fetch;

    useSelectionStore.setState({ selectedUnit: { unitKind: "municipality", unitId: "13101" } });

    const { rerender } = renderWithClient(<ChoroplethLayer metric="area_km2" />);

    // 初回：selected が張られるまで待つ。
    await waitFor(() => {
      expect(featureStateCalls.some((c) => c.id === "13101" && c.state.selected === true)).toBe(
        true,
      );
    });
    const selectedCountBefore = featureStateCalls.filter(
      (c) => c.id === "13101" && c.state.selected === true,
    ).length;
    const logLenBefore = stateLog.length;

    // 指標切替：values が差し替わり、値 effect が removeFeatureState({source}) で全 state を消す。
    // その後 selected effect（values 依存）が再走して縁取りを張り直さないと選択が道連れに消える。
    rerender(
      <QueryClientProvider
        client={createQueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ChoroplethLayer metric="pop_change_rate_2020_2050" />
      </QueryClientProvider>,
    );

    // 切替後に「source 一掃（remove）」が起き、その**最後の**一掃の後に selected が再適用されること
    // ＝退行検知の核：値 effect の removeFeatureState が selected を道連れに消した後、selected effect が
    // values 依存で再走して張り直す。selected effect の依存から values を外すと remove 後に張り直されず落ちる。
    await waitFor(() => {
      const after = stateLog.slice(logLenBefore);
      const lastRemoveIdx = after.map((e) => e.kind).lastIndexOf("remove");
      expect(lastRemoveIdx).toBeGreaterThanOrEqual(0);
      const reSelectedAfterRemove = after
        .slice(lastRemoveIdx + 1)
        .some((e) => e.kind === "set" && e.id === "13101" && e.state.selected === true);
      expect(reSelectedAfterRemove).toBe(true);
    });
    // selected の張り直しが実際に追加で起きている（values 依存が無いと増えない＝退行検知）。
    const selectedCountAfter = featureStateCalls.filter(
      (c) => c.id === "13101" && c.state.selected === true,
    ).length;
    expect(selectedCountAfter).toBeGreaterThan(selectedCountBefore);
  });

  // --- ④の本丸：絞り込みハイライト（matched）の feature-state 張り替え（別チャネル・ADR-0028） ---
  // matched effect は hover/selected と同じ values 依存ハザード（values 差し替え時の removeFeatureState
  // 全消去→張り直し・ChoroplethLayer.tsx:291-293）を持つ。見た目（色/太さ/スクリム濃度）は層4目視ゆえ
  // 検証せず、結線（どの code に何の feature-state を張るか）だけを setFeatureState 記録で確かめる。

  it("(a) matchedCodes を渡すと該当に {matched:true}・非該当に {matched:false} を張る", async () => {
    stubFetch(sampleGeometry, sampleValues);

    // 13101 だけ該当（13102 は非該当＝沈める対象）。
    renderWithClient(<ChoroplethLayer matchedCodes={new Set(["13101"])} />);

    // matched effect は geometry がそろってから走る＝非同期に張られるのを待つ。
    await waitFor(() => {
      expect(featureStateCalls.some((c) => c.id === "13101" && c.state.matched === true)).toBe(
        true,
      );
    });
    // 非該当には matched:false を張る（白スクリムの == false 判定に必要・未設定では沈まない）。
    expect(featureStateCalls.some((c) => c.id === "13102" && c.state.matched === false)).toBe(true);
  });

  it("(b) matchedCodes=null は非作動：一度も張っていなければ matched を消さない（no-op）", async () => {
    stubFetch(sampleGeometry, sampleValues);

    renderWithClient(<ChoroplethLayer matchedCodes={null} />);

    // 値の張り（present）が済むまで待ってから matched 系の呼び出しが無いことを確かめる。
    await waitFor(() => {
      expect(featureStateCalls.some((c) => c.id === "13101" && c.state.present === true)).toBe(
        true,
      );
    });
    // matched は1つも張られない（条件ゼロ＝普通の色分け地図）。
    expect(featureStateCalls.some((c) => "matched" in c.state)).toBe(false);
    // per-feature の matched 後始末（removeFeatureState(...,"matched")）も走らない（prevMatchedActiveRef）。
    expect(removeStateArgs.some((a) => a.key === "matched")).toBe(false);
  });

  it("(b') matched を張った後に matchedCodes=null へ戻すと該当を removeFeatureState(...,'matched') で消す", async () => {
    stubFetch(sampleGeometry, sampleValues);

    const { rerender } = renderWithClient(<ChoroplethLayer matchedCodes={new Set(["13101"])} />);
    // まず matched が張られるのを待つ。
    await waitFor(() => {
      expect(featureStateCalls.some((c) => c.state.matched === true)).toBe(true);
    });

    // 条件解除（null）へ戻す＝直前に張った matched を per-feature で消す（普通の色分けへ）。
    rerender(
      <QueryClientProvider
        client={createQueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ChoroplethLayer matchedCodes={null} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      // geometry の全 feature（13101/13102）について matched キーの remove が呼ばれる。
      expect(removeStateArgs.some((a) => a.id === "13101" && a.key === "matched")).toBe(true);
    });
    expect(removeStateArgs.some((a) => a.id === "13102" && a.key === "matched")).toBe(true);
  });

  it("(c) values 差し替え（removeFeatureState で source 一掃）後に matched が張り直される", async () => {
    // 指標切替で query が再走＝values が差し替わる状況（hover/selected の (c) と同形）。
    const valuesByMetric: Record<string, MetricValue[]> = {
      area_km2: [{ code: "13101", value: 11.64, status: "present" }],
      pop_change_rate_2020_2050: [{ code: "13101", value: -0.08, status: "present" }],
    };
    globalThis.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.startsWith("/api/choropleth/values")) {
        const metric = new URL(url, "http://x").searchParams.get("metric") ?? "area_km2";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => valuesByMetric[metric] ?? [],
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => sampleGeometry });
    }) as unknown as typeof fetch;

    const { rerender } = renderWithClient(
      <ChoroplethLayer metric="area_km2" matchedCodes={new Set(["13101"])} />,
    );

    // 初回：matched が張られるまで待つ。
    await waitFor(() => {
      expect(featureStateCalls.some((c) => c.id === "13101" && c.state.matched === true)).toBe(
        true,
      );
    });
    const matchedCountBefore = featureStateCalls.filter(
      (c) => c.id === "13101" && c.state.matched === true,
    ).length;
    const logLenBefore = stateLog.length;

    // 指標切替：values が差し替わり、値 effect が removeFeatureState({source}) で全 state を消す。
    // その後 matched effect（values 依存）が再走して張り直さないとハイライトが道連れに消える。
    rerender(
      <QueryClientProvider
        client={createQueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ChoroplethLayer metric="pop_change_rate_2020_2050" matchedCodes={new Set(["13101"])} />
      </QueryClientProvider>,
    );

    // 切替後に source 一掃（remove）が起き、その**最後の**一掃の後に matched が再適用されること
    // ＝退行検知の核（hover/selected と同じ values 依存ハザード）。
    await waitFor(() => {
      const after = stateLog.slice(logLenBefore);
      const lastRemoveIdx = after.map((e) => e.kind).lastIndexOf("remove");
      expect(lastRemoveIdx).toBeGreaterThanOrEqual(0);
      const reMatchedAfterRemove = after
        .slice(lastRemoveIdx + 1)
        .some((e) => e.kind === "set" && e.id === "13101" && e.state.matched === true);
      expect(reMatchedAfterRemove).toBe(true);
    });
    // matched の張り直しが実際に追加で起きている（values 依存が無いと増えない＝退行検知）。
    const matchedCountAfter = featureStateCalls.filter(
      (c) => c.id === "13101" && c.state.matched === true,
    ).length;
    expect(matchedCountAfter).toBeGreaterThan(matchedCountBefore);
  });

  // --- source 未生成ガード（PR #60 で巻き取ったバグ：source 不在で setFeatureState が例外を投げる） ---

  it("source が未生成（getSource→undefined）の間は setFeatureState/removeFeatureState を呼ばない", async () => {
    stubFetch(sampleGeometry, sampleValues);
    const originalGetSource = fakeMap.getSource;
    // source が地図スタイルにまだ無い状態を模す＝4 effect いずれも feature-state を触ってはいけない
    // （触ると MapLibre が "The source 'choropleth' does not exist" を投げる）。
    fakeMap.getSource = (() => undefined) as typeof fakeMap.getSource;
    try {
      renderWithClient(<ChoroplethLayer hoveredId="13102" matchedCodes={new Set(["13101"])} />);
      // マウント後に選択を立てる（選択 effect のガードを踏ませる意図）。マウント中の store 更新は
      // component を再描画させるため act で包む＝act 外更新の警告を出さない（品質方針＝act 警告0）。
      act(() => {
        useSelectionStore.setState({ selectedUnit: { unitKind: "municipality", unitId: "13101" } });
      });

      // source を出す描画（<Source>）までは進む＝レイヤー合成自体は壊さない。
      await screen.findByTestId("source");
      // が、feature-state には一切触れない（ガードで早期 return）＝呼び出し記録が空のまま。
      await new Promise((r) => setTimeout(r, 0));
      expect(featureStateCalls).toHaveLength(0);
      expect(removeStateCalls).toHaveLength(0);
    } finally {
      fakeMap.getSource = originalGetSource;
    }
  });
});
