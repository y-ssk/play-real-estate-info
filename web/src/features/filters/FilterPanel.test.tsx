import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useFilterDrawerStore } from "../../lib/filterDrawerStore";
import { FilterDrawerToggle, FilterPanel } from "./FilterPanel";

// ドロワーの開閉挙動（ADR-0029）の検証：唯一のトグルで開閉・X/ESC で閉じる・閉じたら起点へフォーカス復帰。
// 見た目（スライド）は jsdom 不可ゆえ層4。ここは「開く」「閉じる」「フォーカスが返る」の挙動だけ。
const RANGES = { area_km2: { min: 0, max: 100 } };

function renderDrawer() {
  // トグル（復帰先 id を持つ唯一の開閉ボタン）とパネルを同じ store の下に並べて描く（App の配置と同型）。
  return render(
    <>
      <FilterDrawerToggle />
      <FilterPanel rangesByMetric={RANGES} />
    </>,
  );
}

describe("FilterPanel ドロワー開閉（ADR-0029）", () => {
  afterEach(() => {
    useFilterDrawerStore.setState({ isOpen: false });
  });

  it("初期は閉＝トグルだけ（閉じる(X)は出ない＝パネル未表示）", () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: "絞り込みを開く" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "絞り込みを閉じる" })).toBeNull();
  });

  it("トグルを押すと開く（同じトグルをもう一度押すと閉じる＝開閉両用）", async () => {
    renderDrawer();
    const toggle = screen.getByRole("button", { name: "絞り込みを開く" });
    fireEvent.click(toggle);
    expect(useFilterDrawerStore.getState().isOpen).toBe(true);
    // 開くと同じトグル（id 不変）のラベルが「閉じる」へ＝開閉両用の唯一のトグル。再押下で閉じる。
    expect(toggle.getAttribute("aria-label")).toBe("絞り込みを閉じる");
    fireEvent.click(toggle);
    await waitFor(() => expect(useFilterDrawerStore.getState().isOpen).toBe(false));
  });

  it("ヘッダの閉じる(X)で閉じる", async () => {
    renderDrawer();
    act(() => {
      useFilterDrawerStore.getState().toggle(); // 開く
    });
    // 開いている間は「絞り込みを閉じる」ラベルがトグルと X の2つ＝X（パネル内）で閉じる。
    const closers = await screen.findAllByRole("button", { name: "絞り込みを閉じる" });
    expect(closers.length).toBe(2);
    const panelX = closers.at(-1); // 後勝ち＝パネル内の X（トグルは先に描画）。
    if (!panelX) {
      throw new Error("閉じる(X) が見つからない");
    }
    fireEvent.click(panelX);
    await waitFor(() => expect(useFilterDrawerStore.getState().isOpen).toBe(false));
  });

  it("開いている間 ESC で閉じる", async () => {
    renderDrawer();
    act(() => {
      useFilterDrawerStore.getState().toggle(); // 開く
    });
    expect(useFilterDrawerStore.getState().isOpen).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(useFilterDrawerStore.getState().isOpen).toBe(false));
  });

  it("閉じていない間は ESC で何も起きない（誤作動しない）", () => {
    renderDrawer();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(useFilterDrawerStore.getState().isOpen).toBe(false);
  });

  it("閉じたらフォーカスを起点のトグルへ戻す", async () => {
    renderDrawer();
    act(() => {
      useFilterDrawerStore.getState().toggle(); // 開く
    });
    act(() => {
      useFilterDrawerStore.getState().close();
    });
    const toggle = screen.getByRole("button", { name: "絞り込みを開く" });
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });
});
