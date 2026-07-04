import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useFilterDrawerStore } from "../../lib/filterDrawerStore";
import { FilterDrawerToggle, FilterPanel } from "./FilterPanel";

// ドロワーの開閉挙動（ADR-0029 → ADR-0031 で更新）の検証：左操作列のボタンで開く・開いてもボタンは残り
// （aria-expanded=true・再クリックで閉じる）・X/ESC でも閉じる・閉じたら起点へフォーカス復帰。
// 見た目（スライド・active 表示・×がボタンに近接）は jsdom 不可ゆえ層4。
const RANGES = { area_km2: { min: 0, max: 100 } };

// useMountTransition の入り（二段 rAF）／出（200ms の setTimeout でアンマウント）由来の state 更新を
// act 内で確実に流す＝それらが act 外で起きると React が警告を出すため。PANEL_MOTION_MS(200) を跨ぐ待ち。
async function flushMountTransition() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
}

function renderDrawer() {
  // トグル（復帰先 id を持つ開閉ボタン・ADR-0031＝開いても残る）とパネルを同じ store の下に並べて描く（App と同型）。
  return render(
    <>
      <FilterDrawerToggle />
      <FilterPanel rangesByMetric={RANGES} />
    </>,
  );
}

describe("FilterPanel ドロワー開閉（ADR-0029/0031）", () => {
  afterEach(() => {
    // store のリセットも act で包む（マウント中の component を再描画させるため＝act 外更新の警告を避ける）。
    act(() => {
      useFilterDrawerStore.setState({ isOpen: false });
    });
  });

  it("初期は閉＝操作列の「絞り込み」ボタンだけ（aria-expanded=false・閉じる(X)は出ない＝パネル未表示）", () => {
    renderDrawer();
    const toggle = screen.getByRole("button", { name: "絞り込み" });
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: "絞り込みを閉じる" })).toBeNull();
  });

  it("トグルを押すと開き、開いてもボタンは残る（aria-expanded=true・×も出る）", async () => {
    renderDrawer();
    fireEvent.click(screen.getByRole("button", { name: "絞り込み" }));
    await flushMountTransition(); // 入りアニメ（rAF）を act 内で流す。
    expect(useFilterDrawerStore.getState().isOpen).toBe(true);
    // 開いてもトグルは残る（ADR-0031＝ADR-0029 の「開いたら隠す」を更新）。押下状態は aria-expanded=true で示す。
    const toggle = screen.getByRole("button", { name: "絞り込み" });
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // パネルの閉じる(X) もヘッダに出る（ボタン直下に近接・層4）。
    expect(screen.getByRole("button", { name: "絞り込みを閉じる" })).toBeTruthy();
    // テスト内で閉じ、出アニメ（アンマウント timer）を act 内で流し切ってから抜ける（afterEach に持ち越さない）。
    act(() => {
      useFilterDrawerStore.getState().close();
    });
    await flushMountTransition();
  });

  it("開いている間にトグルを再クリックすると閉じる（開閉トグル一貫・ADR-0031）", async () => {
    renderDrawer();
    act(() => {
      useFilterDrawerStore.getState().toggle(); // 開く
    });
    await flushMountTransition();
    expect(useFilterDrawerStore.getState().isOpen).toBe(true);
    // 開いても残っているトグルを再クリック＝閉じる（onClick は toggle）。
    fireEvent.click(screen.getByRole("button", { name: "絞り込み" }));
    await waitFor(() => expect(useFilterDrawerStore.getState().isOpen).toBe(false));
    await flushMountTransition(); // 出アニメ（アンマウント timer）を act 内で流す。
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
