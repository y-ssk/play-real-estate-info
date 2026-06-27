import { isDefaultSort, nextSortOnHeaderClick, useFilterStore } from "./filterStore";

// filter store（条件・並べ替えの共有 UI 状態・ADR-0012/0018）の検証。
// store を React 非依存に getState/setState で検証する（純粋な状態ロジックを手厚く・frontend-conventions §8）。
describe("useFilterStore", () => {
  afterEach(() => {
    // テスト間の汚染を避け初期へ戻す。
    useFilterStore.setState({ conditions: {}, sort: { metricKey: null, direction: "asc" } });
  });

  it("初期は条件なし・コード昇順", () => {
    const s = useFilterStore.getState();
    expect(s.conditions).toEqual({});
    expect(isDefaultSort(s.sort)).toBe(true);
  });

  it("setCondition は指標ごとの条件を立てる", () => {
    useFilterStore.getState().setCondition("area_km2", { min: 10 });
    expect(useFilterStore.getState().conditions.area_km2).toEqual({ min: 10 });
  });

  it("min/max とも undefined を渡すと条件を取り除く（空条件を溜めない）", () => {
    useFilterStore.getState().setCondition("area_km2", { min: 10 });
    useFilterStore.getState().setCondition("area_km2", { min: undefined, max: undefined });
    expect(useFilterStore.getState().conditions.area_km2).toBeUndefined();
    expect(useFilterStore.getState().conditions).toEqual({});
  });

  it("clearConditions は全条件を外す（並べ替えは保つ）", () => {
    useFilterStore.getState().setCondition("area_km2", { min: 10 });
    useFilterStore.getState().setSort({ metricKey: "area_km2", direction: "desc" });
    useFilterStore.getState().clearConditions();
    expect(useFilterStore.getState().conditions).toEqual({});
    expect(useFilterStore.getState().sort).toEqual({ metricKey: "area_km2", direction: "desc" });
  });
});

describe("nextSortOnHeaderClick（列ヘッダのトグル規則）", () => {
  it("別の列を押すと昇順から始める", () => {
    const next = nextSortOnHeaderClick({ metricKey: null, direction: "asc" }, "area_km2");
    expect(next).toEqual({ metricKey: "area_km2", direction: "asc" });
  });

  it("同じ列を再度押すと向きが反転する（asc→desc）", () => {
    const next = nextSortOnHeaderClick({ metricKey: "area_km2", direction: "asc" }, "area_km2");
    expect(next).toEqual({ metricKey: "area_km2", direction: "desc" });
  });

  it("同じ列をもう一度押すと戻る（desc→asc）", () => {
    const next = nextSortOnHeaderClick({ metricKey: "area_km2", direction: "desc" }, "area_km2");
    expect(next).toEqual({ metricKey: "area_km2", direction: "asc" });
  });

  it("名称列（null）も同様に反転できる", () => {
    const next = nextSortOnHeaderClick({ metricKey: null, direction: "asc" }, null);
    expect(next).toEqual({ metricKey: null, direction: "desc" });
  });
});
