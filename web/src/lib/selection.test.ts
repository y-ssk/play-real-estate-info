import { useSelectionStore } from "./selection";

// 選択状態ストアの単体テスト（ADR-0018 識別子・状態の真実は Zustand）。
// store の getState/setState で React 非依存に検証する（純粋な状態ロジックを手厚く・frontend-conventions §8）。
describe("useSelectionStore", () => {
  afterEach(() => {
    // 各テスト後に未選択へ戻す（テスト間のキャッシュ汚染を避ける）。
    useSelectionStore.getState().clear();
  });

  it("初期状態は未選択（null＝パネル閉・地図全面）", () => {
    expect(useSelectionStore.getState().selectedUnit).toBeNull();
  });

  it("select は {unitKind, unitId} を立てる（裸の文字列にしない・ADR-0018）", () => {
    useSelectionStore.getState().select({ unitKind: "municipality", unitId: "13101" });
    expect(useSelectionStore.getState().selectedUnit).toEqual({
      unitKind: "municipality",
      unitId: "13101",
    });
  });

  it("clear は未選択に戻す（カルテのクローズ＝地図全面へ）", () => {
    useSelectionStore.getState().select({ unitKind: "municipality", unitId: "13101" });
    useSelectionStore.getState().clear();
    expect(useSelectionStore.getState().selectedUnit).toBeNull();
  });
});
