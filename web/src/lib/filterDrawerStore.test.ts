import { useFilterDrawerStore } from "./filterDrawerStore";

// 絞り込みドロワーの開閉状態（ADR-0029）の検証。store は React 非依存に getState で検証
// （frontend-conventions §8）。PC は移動なし＝位置/クランプは撤回（ADR-0029 改訂）。
describe("useFilterDrawerStore", () => {
  afterEach(() => {
    useFilterDrawerStore.setState({ isOpen: false });
  });

  it("初期は閉（地図全面で探索）", () => {
    expect(useFilterDrawerStore.getState().isOpen).toBe(false);
  });

  it("toggle は開閉を反転する", () => {
    useFilterDrawerStore.getState().toggle();
    expect(useFilterDrawerStore.getState().isOpen).toBe(true);
    useFilterDrawerStore.getState().toggle();
    expect(useFilterDrawerStore.getState().isOpen).toBe(false);
  });

  it("close は閉じる（開いていても地図全面へ）", () => {
    useFilterDrawerStore.setState({ isOpen: true });
    useFilterDrawerStore.getState().close();
    expect(useFilterDrawerStore.getState().isOpen).toBe(false);
  });
});
