import { QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Karte } from "../../lib/karte";
import { createQueryClient } from "../../lib/queryClient";
import { useSelectionStore } from "../../lib/selection";
import { KartePanel } from "./KartePanel";

// カルテ応答スタブ：present(面積)・present(推計・到達年)・none(データなし)・suppressed(秘匿) の4種で
// データなし3区別の表示分け・出典・推計明示を確かめる（ADR-0011/0009）。
const sampleKarte: Karte = {
  code: "13101",
  name: "千代田区",
  pref_code: "13",
  metrics: [
    {
      metric: "area_km2",
      value: 11.64,
      status: "present",
      year: null,
      source: "出典：国土数値情報 行政区域データ（N03）より算出",
    },
    {
      metric: "pop_change_rate_2020_2050",
      value: 0.197,
      status: "present",
      year: 2050,
      source: "出典：国土数値情報 将来推計人口250mメッシュ（XKT013）／推計（2020→2050）",
    },
    {
      metric: "school_count", // registry 未登録＝カルテ専用指標のフォールバック確認
      value: null,
      status: "none",
      year: null,
      source: "出典：（未整備）",
    },
    {
      metric: "pop_mesh_secret",
      value: null,
      status: "suppressed",
      year: 2050,
      source: "出典：将来推計人口250mメッシュ（XKT013）／秘匿",
    },
  ],
};

function stubFetch(body: unknown, ok = true, status = 200): void {
  globalThis.fetch = jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }) as unknown as typeof fetch;
}

function renderWithClient(ui: ReactNode) {
  const client = createQueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("KartePanel", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    act(() => useSelectionStore.getState().clear());
  });

  it("未選択ではパネルを出さない（③閉＝地図全面）", () => {
    renderWithClient(<KartePanel />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("選択するとカルテを開き、名称・値・単位・出典を出す（ADR-0011）", async () => {
    stubFetch(sampleKarte);
    renderWithClient(<KartePanel />);

    // 地図クリック相当：選択単位を立てる（ADR-0018 識別子）。
    act(() => useSelectionStore.getState().select({ unitKind: "municipality", unitId: "13101" }));

    // 名称が見出しに出る。
    expect(await screen.findByText("千代田区")).toBeInTheDocument();
    // 面積：registry の表示名・整形（km²）で出る（二重管理しない・§5）。
    expect(screen.getByText("市区町村の面積")).toBeInTheDocument();
    expect(screen.getByText(/11\.6.*km²/)).toBeInTheDocument();
    // 出典が各指標に出る（法的要件・ADR-0011 (c)）。
    expect(screen.getByText(/N03.*より算出/)).toBeInTheDocument();
  });

  it("推計指標は出典に「推計」を明示する（ADR-0009 断定しない）", async () => {
    stubFetch(sampleKarte);
    renderWithClient(<KartePanel />);
    act(() => useSelectionStore.getState().select({ unitKind: "municipality", unitId: "13101" }));

    await screen.findByText("千代田区");
    // 増減率は registry の表示名（「推計 2020→2050」を含む）＋出典に推計明示。
    expect(screen.getByText(/将来人口の増減率（推計 2020→2050）/)).toBeInTheDocument();
    expect(screen.getByText(/推計（2020→2050）/)).toBeInTheDocument();
  });

  it("データなし3区別を見た目で分ける（none＝データなし・suppressed＝秘匿・ADR-0011）", async () => {
    stubFetch(sampleKarte);
    renderWithClient(<KartePanel />);
    act(() => useSelectionStore.getState().select({ unitKind: "municipality", unitId: "13101" }));

    await screen.findByText("千代田区");
    // none：0 や空欄でごまかさず「データなし」と明示（「危険ゼロ」と混同しない）。
    expect(screen.getByText(/データなし（未整備）/)).toBeInTheDocument();
    // suppressed：秘匿（非公開）と明示。
    expect(screen.getByText(/秘匿（非公開）/)).toBeInTheDocument();
  });

  it("閉じるボタンで選択を解除しパネルを閉じる（③開閉式・地図全面へ）", async () => {
    stubFetch(sampleKarte);
    renderWithClient(<KartePanel />);
    act(() => useSelectionStore.getState().select({ unitKind: "municipality", unitId: "13101" }));

    const close = await screen.findByLabelText("カルテを閉じる");
    fireEvent.click(close);

    await waitFor(() => {
      expect(useSelectionStore.getState().selectedUnit).toBeNull();
    });
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
