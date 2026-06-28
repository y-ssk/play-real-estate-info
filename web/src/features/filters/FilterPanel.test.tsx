import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useFilterDrawerStore } from "../../lib/filterDrawerStore";
import { FilterDrawerToggle, FilterPanel } from "./FilterPanel";

// ドロワーの開閉挙動（ADR-0029 最終版）の検証：左操作列のボタンで開く・開くとトグルは隠れる・
// X/ESC で閉じる・閉じたら起点へフォーカス復帰。見た目（スライド）は jsdom 不可ゆえ層4。
const RANGES = { area_km2: { min: 0, max: 100 } };

// useMountTransition の入り（二段 rAF）／出（200ms の setTimeout でアンマウント）由来の state 更新を
// act 内で確実に流す＝それらが act 外で起きると React が警告を出すため。PANEL_MOTION_MS(200) を跨ぐ待ち。
async function flushMountTransition() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
}

function renderDrawer() {
  // トグル（復帰先 id を持つ「開く」専用ボタン）とパネルを同じ store の下に並べて描く（App の配置と同型）。
  return render(
    <>
      <FilterDrawerToggle />
      <FilterPanel rangesByMetric={RANGES} />
    </>,
  );
}

describe("FilterPanel ドロワー開閉（ADR-0029）", () => {
  afterEach(() => {
    // store のリセットも act で包む（マウント中の component を再描画させるため＝act 外更新の警告を避ける）。
    act(() => {
      useFilterDrawerStore.setState({ isOpen: false });
    });
  });

  it("初期は閉＝操作列の「絞り込み」ボタンだけ（閉じる(X)は出ない＝パネル未表示）", () => {
    renderDrawer();
    expect(screen.getByRole("button", { name: "絞り込み" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "絞り込みを閉じる" })).toBeNull();
  });

  it("トグルを押すと開き、開いている間はトグルが隠れる（パネルと重ならない）", async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "絞り込み" }));
    await flushMountTransition(); // 入りアニメ（rAF）を act 内で流す。
    expect(useFilterDrawerStore.getState().isOpen).toBe(true);
    // 開くと操作列のトグルは消える＝パネル（左オーバーレイ）と重ならない（ADR-0029）。
    expect(screen.queryByRole("button", { name: "絞り込み" })).toBeNull();
    // 代わりにパネルの閉じる(X) が出る。
    expect(screen.getByRole("button", { name: "絞り込みを閉じる" })).toBeTruthy();
    // テスト内で閉じ、出アニメ（アンマウント timer）を act 内で流し切ってから抜ける（afterEach に持ち越さない）。
    act(() => {
      useFilterDrawerStore.getState().close();
    });
    await flushMountTransition();
  });

  it("ヘッダの閉じる(X)で閉じる（トグルが戻る）", async () => {
    renderDrawer();
    act(() => {
      useFilterDrawerStore.getState().toggle(); // 開く
    });
    await flushMountTransition();
    fireEvent.click(screen.getByRole("button", { name: "絞り込みを閉じる" }));
    await waitFor(() => expect(useFilterDrawerStore.getState().isOpen).toBe(false));
    expect(screen.getByRole("button", { name: "絞り込み" })).toBeTruthy();
    await flushMountTransition(); // 出アニメ（アンマウント timer）を act 内で流す。
  });

  it("開いている間 ESC で閉じる", async () => {
    renderDrawer();
    act(() => {
      useFilterDrawerStore.getState().toggle(); // 開く
    });
    await flushMountTransition();
    expect(useFilterDrawerStore.getState().isOpen).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(useFilterDrawerStore.getState().isOpen).toBe(false));
    await flushMountTransition(); // 出アニメ（アンマウント timer）を act 内で流す。
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
    await flushMountTransition();
    act(() => {
      useFilterDrawerStore.getState().close();
    });
    // 閉じるとトグルが再生し、そこへフォーカスが返る（開いた起点へ）。
    const toggle = await screen.findByRole("button", { name: "絞り込み" });
    await waitFor(() => expect(document.activeElement).toBe(toggle));
    await flushMountTransition(); // 出アニメ（アンマウント timer）を act 内で流す。
  });
});
