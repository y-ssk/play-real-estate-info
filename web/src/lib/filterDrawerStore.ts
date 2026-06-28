import { create } from "zustand";

/**
 * 絞り込みドロワーの開閉状態（クライアント UI 状態・Zustand・ADR-0018/0029）。
 *
 * **状態の真実はここ**：開閉を store に持つ＝開閉は「画面遷移ではなく状態」（ADR-0029・docs/05§4 遷移図は
 * 不変）。PC では移動しない（固定）ため位置 store は持たない＝開閉だけ（当初の可動＝offset は層4で破綻し撤回・
 * ADR-0029 改訂）。
 *
 * なぜ条件 store（`filterStore.ts`）と分けるか：あちらは絞り込みの「中身」（指標条件・並べ替え）、
 * こちらはドロワーの「開閉」（器の状態）。関心が違い消費先も違う（条件は地図ハイライトが見る／開閉は
 * パネルだけが見る）ため、選択 store（`selection.ts`）と同じく関心ごとに分ける（frontend-conventions §1）。
 */
interface FilterDrawerState {
  /** 開いているか（左端ドロワー＝開でスライド表示・閉で地図全面・ADR-0029）。初期＝閉（地図全面で探索）。 */
  isOpen: boolean;
  /** 開閉を切り替える（左上の丸トグル押下から＝開閉両用の唯一のトグル・ADR-0029）。 */
  toggle: () => void;
  /** 明示的に閉じる（閉じる(X)・ESC から。地図全面へ戻す）。 */
  close: () => void;
}

/**
 * useFilterDrawerStore は絞り込みドロワーの開閉を持つ共有 UI 状態（ADR-0018/0029）。
 *
 * 購読側は selector で必要分だけ取り再描画を絞る（トグルも閉じるも isOpen を見る）。
 *
 * @example
 * const isOpen = useFilterDrawerStore((s) => s.isOpen);
 * const toggle = useFilterDrawerStore((s) => s.toggle);
 */
export const useFilterDrawerStore = create<FilterDrawerState>((set) => ({
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
}));
