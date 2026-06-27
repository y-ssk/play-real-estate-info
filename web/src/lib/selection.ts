import { create } from "zustand";

/**
 * 選択中の単位の識別子（ADR-0018）。
 *
 * **裸の市区町村コードにしない**＝種別を同居させる：メッシュ移行（ADR-0015）で粒度が
 * 'municipality'→'mesh250' に変わっても store/Query キー/将来 URL を作り直さない継ぎ目。
 */
export interface SelectedUnit {
  /** 単位の種別。MVP は 'municipality'（区粒度）。メッシュ移行で 'mesh250' 等が増える。 */
  unitKind: string;
  /** 単位の識別子（市区町村なら5桁コード）。 */
  unitId: string;
}

/**
 * 選択状態ストアの形（クライアント UI 状態・ADR-0018）。
 *
 * **状態の真実はここ**（Zustand）。地図の選択強調（setFeatureState）は描画の鏡であって
 * 真実ではない（二重管理しない・frontend-conventions §3）。
 */
interface SelectionState {
  /** 選択中の単位。未選択は null（＝カルテパネルは閉じ地図が全面）。 */
  selectedUnit: SelectedUnit | null;
  /** 単位を選ぶ（地図クリック等から）。同じ単位の再選択は同値で上書き（無害）。 */
  select: (unit: SelectedUnit) => void;
  /** 選択を解除する（カルテパネルのクローズ＝地図全面へ戻す）。 */
  clear: () => void;
}

/**
 * useSelectionStore は選択中の単位（カルテ表示対象）を持つ共有 UI 状態（ADR-0018）。
 *
 * map（クリックで選ぶ）と karte（選択単位のカルテを出す）が共有する＝機能どうしを直接依存させず
 * 共有層（lib）で持つ（frontend-conventions §1）。購読側は selector で必要分だけ取り、再描画を絞る。
 *
 * @example
 * const selected = useSelectionStore((s) => s.selectedUnit);
 * const select = useSelectionStore((s) => s.select);
 */
export const useSelectionStore = create<SelectionState>((set) => ({
  selectedUnit: null,
  select: (unit) => set({ selectedUnit: unit }),
  clear: () => set({ selectedUnit: null }),
}));
