import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useFilterDrawerStore } from "../../lib/filterDrawerStore";
import { FilterDrawerToggle, FilterPanel } from "./FilterPanel";

// 非モーダル a11y（ADR-0029 規約例外）の挙動検証：ESC で閉じる／閉じたら起点のトグルへフォーカスを戻す。
// 見た目（スライド・掴み感・地図パン）は jsdom 不可ゆえ層4。ここは「閉じる」「フォーカスが返る」の挙動だけ。
const RANGES = { area_km2: { min: 0, max: 100 } };

function renderDrawer() {
  // トグル（復帰先 id を持つ）とパネルを同じ store の下に並べて描く（App の配置と同型）。
  return render(
    <>
      <FilterDrawerToggle />
      <FilterPanel rangesByMetric={RANGES} />
    </>,
  );
}

describe("FilterPanel 非モーダル a11y（ADR-0029）", () => {
  afterEach(() => {
    useFilterDrawerStore.setState({ isOpen: false, offset: null });
  });

  it("開いている間 ESC で閉じる（close）", async () => {
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
    // 閉じる（パネル内の閉じるボタン経由でなく store 操作で立ち下がりを起こす）。
    act(() => {
      useFilterDrawerStore.getState().close();
    });
    const toggle = screen.getByRole("button", { name: "絞り込みを開く" });
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });
});
