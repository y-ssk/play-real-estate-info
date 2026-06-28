import { type ClampInput, clampDrawerOffset, useFilterDrawerStore } from "./filterDrawerStore";

// 絞り込みドロワーの状態（開閉・位置・ADR-0029）の検証。
// store は React 非依存に getState で、クランプは純関数として手厚く検証（frontend-conventions §8）。
describe("useFilterDrawerStore", () => {
  afterEach(() => {
    useFilterDrawerStore.setState({ isOpen: false, offset: null });
  });

  it("初期は閉・未移動（地図全面で探索）", () => {
    const s = useFilterDrawerStore.getState();
    expect(s.isOpen).toBe(false);
    expect(s.offset).toBeNull();
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

  it("setOffset は浮かせ量を立てる", () => {
    useFilterDrawerStore.getState().setOffset({ dx: 40, dy: 80 });
    expect(useFilterDrawerStore.getState().offset).toEqual({ dx: 40, dy: 80 });
  });
});

describe("clampDrawerOffset（画面外へ出さない・ADR-0029）", () => {
  // 基準：280x400 のパネルを 1000x800 のビューポート、既定左上 (8,8)、余白 8。
  const base = (over: Partial<ClampInput> = {}): ClampInput => ({
    baseX: 8,
    baseY: 8,
    desiredDx: 0,
    desiredDy: 0,
    panelWidth: 280,
    panelHeight: 400,
    viewportWidth: 1000,
    viewportHeight: 800,
    margin: 8,
    ...over,
  });

  it("移動量0なら既定位置のまま（オフセット0）", () => {
    expect(clampDrawerOffset(base())).toEqual({ dx: 0, dy: 0 });
  });

  it("画面内の妥当な移動はそのまま通す", () => {
    expect(clampDrawerOffset(base({ desiredDx: 200, desiredDy: 100 }))).toEqual({
      dx: 200,
      dy: 100,
    });
  });

  it("左/上へ出し過ぎると端の余白で止まる（負側クランプ）", () => {
    // 既定左上(8,8)から左/上へ -100 ＝ 左上(-92,-92) を狙うが、最小は margin=8 ＝ 左上(8,8) で止まる。
    expect(clampDrawerOffset(base({ desiredDx: -100, desiredDy: -100 }))).toEqual({
      dx: 0,
      dy: 0,
    });
  });

  it("右/下へ出し過ぎると端の余白で止まる（正側クランプ）", () => {
    // 右上限 = 1000-280-8 = 712（左上x）。下上限 = 800-400-8 = 392（左上y）。
    // 既定(8,8)からの最大オフセット = (712-8, 392-8) = (704, 384)。
    expect(clampDrawerOffset(base({ desiredDx: 9999, desiredDy: 9999 }))).toEqual({
      dx: 704,
      dy: 384,
    });
  });

  it("パネルがビューポートより大きい軸は左上端を画面内に保つ（はみ出しは右下へ）", () => {
    // 高さ 900 > ビューポート 800：下上限 max(8, 800-900-8=-108)=8 ＝ 左上y は margin で固定。
    const out = clampDrawerOffset(base({ panelHeight: 900, desiredDy: 9999 }));
    expect(out.dy).toBe(0); // 既定(8)から動かず＝左上端(=ヘッダ)が画面内に残る。
  });

  it("margin 既定0でも端まで寄せられる", () => {
    const out = clampDrawerOffset(base({ margin: undefined, desiredDx: -9999, desiredDy: -9999 }));
    // 既定(8,8)から左上(0,0)まで寄れる＝オフセット(-8,-8)。
    expect(out).toEqual({ dx: -8, dy: -8 });
  });
});
