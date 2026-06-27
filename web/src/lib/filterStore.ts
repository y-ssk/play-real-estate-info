import { create } from "zustand";
import type { MetricCondition, SortDirection, SortSpec } from "./filtering";

/**
 * 絞り込み・並べ替えの共有 UI 状態（クライアント状態＝Zustand・ADR-0018）。
 *
 * **状態の真実はここ**：絞り込みパネル（条件入力）・一覧（並べ替えヘッダ）・地図ハイライト
 * （`setFeatureState({matched})`）の三者が、この store を唯一の真実として参照する（二重管理しない・
 * frontend-conventions §3）。地図の matched 強調は描画の鏡。
 *
 * 共有層 `lib/` に置く理由：filters（条件入力）・list（並べ替え・一覧）・map（ハイライト）が共有するため、
 * 機能どうしを直接依存させない（選択 store `selection.ts` と同方針・frontend-conventions §1）。
 *
 * 重みづけ（スコアリング）はしない＝条件は指標ごとの数値境目を AND で持つだけ（ADR-0012）。
 */
interface FilterState {
  /** 指標キー→数値条件（min/max）。未登録 or 空（min/max とも undefined）＝その指標で絞らない。 */
  conditions: Record<string, MetricCondition>;
  /** 一覧の並べ替え（指標キー＋向き）。初期＝コード昇順の既定並び。 */
  sort: SortSpec;
  /**
   * 1指標の条件を差し替える（パネルの min/max 入力から）。
   * min/max とも undefined を渡すと当該条件を取り除く（制約なしへ戻す）＝空条件を溜めない。
   */
  setCondition: (metricKey: string, cond: MetricCondition) => void;
  /** 全条件を解除する（絞り込みリセット＝全件表示へ戻す）。並べ替えは保つ。 */
  clearConditions: () => void;
  /** 並べ替えを設定する（一覧の列ヘッダ操作から）。同じ指標を再指定したら向きを反転させるかは呼び側で決める。 */
  setSort: (sort: SortSpec) => void;
}

/** 初期の並べ替え＝コード昇順（geometry 母体の安定並び）。 */
const INITIAL_SORT: SortSpec = { metricKey: null, direction: "asc" };

/**
 * useFilterStore は絞り込み条件・並べ替えを持つ共有 UI 状態（ADR-0012/0018）。
 *
 * 購読側は selector で必要分だけ取り、再描画を絞る（例：パネルは conditions、一覧は sort のみ）。
 *
 * @example
 * const conditions = useFilterStore((s) => s.conditions);
 * const setCondition = useFilterStore((s) => s.setCondition);
 */
export const useFilterStore = create<FilterState>((set) => ({
  conditions: {},
  sort: INITIAL_SORT,
  setCondition: (metricKey, cond) =>
    set((state) => {
      const next = { ...state.conditions };
      // 空条件（min/max とも未指定）は溜めず取り除く＝「絞っていない」を素直に表す。
      if (cond.min === undefined && cond.max === undefined) {
        delete next[metricKey];
      } else {
        next[metricKey] = cond;
      }
      return { conditions: next };
    }),
  clearConditions: () => set({ conditions: {} }),
  setSort: (sort) => set({ sort }),
}));

/** 既定（コード昇順）かを判定する補助（一覧ヘッダの向き表示・テストの参照に使う）。 */
export function isDefaultSort(sort: SortSpec): boolean {
  return sort.metricKey === null && sort.direction === "asc";
}

/**
 * 一覧の列ヘッダ押下時の次の並べ替えを決める（同じ指標の再押下で昇順↔降順を反転）。
 *
 * 純関数として切り出す理由：ヘッダ操作のトグル規則（同列再押下で向き反転・別列は昇順から）を
 * UI から分離してテストする（frontend-conventions §8）。
 *
 * @param current 現在の並べ替え。
 * @param metricKey 押された列の指標キー（null＝名称/コード列）。
 */
export function nextSortOnHeaderClick(current: SortSpec, metricKey: string | null): SortSpec {
  if (current.metricKey === metricKey) {
    const direction: SortDirection = current.direction === "asc" ? "desc" : "asc";
    return { metricKey, direction };
  }
  // 別の列＝その列の昇順から始める（指標は小さい順が直感の起点）。
  return { metricKey, direction: "asc" };
}
