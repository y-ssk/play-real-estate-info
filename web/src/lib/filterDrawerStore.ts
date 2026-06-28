import { create } from "zustand";

/**
 * 絞り込みドロワーの「置き方」の状態＝開閉と浮かせた位置（クライアント UI 状態・Zustand・ADR-0018/0029）。
 *
 * **状態の真実はここ**：開閉・位置（ヘッダ掴みで動かした座標）を store に持つ＝開閉も移動も
 * 「画面遷移ではなく状態」（ADR-0029・docs/05§4 遷移図は不変）。地図描画は鏡で、ここは構えの真実。
 *
 * なぜ条件 store（`filterStore.ts`）と分けるか：あちらは絞り込みの「中身」（指標条件・並べ替え）、
 * こちらはドロワーの「器の置き方」（開閉・座標）。関心が違い消費先も違う（条件は地図ハイライトが見る／
 * 位置はパネルだけが見る）ため、選択 store（`selection.ts`）と同じく関心ごとに分ける（frontend-conventions §1）。
 *
 * 位置の意味：`offset` は「左端ドロワーの既定位置からの浮かせ量(px)」。null＝まだ動かしていない＝端に格納された
 * 既定位置（開くと端からスライドして出る）。ヘッダを掴んで初めて offset が入り、パネルが浮いて任意位置へ動く。
 */
export interface DrawerOffset {
  /** 既定位置（左端）からの水平オフセット(px・右が正)。 */
  dx: number;
  /** 既定位置（上端付近）からの垂直オフセット(px・下が正)。 */
  dy: number;
}

interface FilterDrawerState {
  /** 開いているか（左端ドロワー＝開でスライド表示・閉で地図全面・ADR-0029）。初期＝閉（地図全面で探索）。 */
  isOpen: boolean;
  /**
   * ヘッダ掴みで動かした浮かせ量。null＝未移動＝端の既定位置（開閉スライドの基準）。
   * 一度でも動かすと {dx,dy} が入り、以後その座標で浮く（ADR-0029 ヘッダ掴みで移動）。
   */
  offset: DrawerOffset | null;
  /** 開閉を切り替える（ハンドル/トグル押下から）。 */
  toggle: () => void;
  /** 明示的に閉じる（地図全面へ戻す）。 */
  close: () => void;
  /** 浮かせ量を設定する（ヘッダドラッグ中の更新。クランプ済みの値を渡す＝画面外へ出さない責務は呼び側の純関数）。 */
  setOffset: (offset: DrawerOffset) => void;
}

/**
 * useFilterDrawerStore は絞り込みドロワーの開閉・位置を持つ共有 UI 状態（ADR-0018/0029）。
 *
 * 購読側は selector で必要分だけ取り再描画を絞る（例：トグルは isOpen のみ・パネルは offset も）。
 *
 * @example
 * const isOpen = useFilterDrawerStore((s) => s.isOpen);
 * const toggle = useFilterDrawerStore((s) => s.toggle);
 */
export const useFilterDrawerStore = create<FilterDrawerState>((set) => ({
  isOpen: false,
  offset: null,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  close: () => set({ isOpen: false }),
  setOffset: (offset) => set({ offset }),
}));

/** クランプの入力＝パネルの実寸とビューポート、求めたい位置（既定位置＋ドラッグ移動量）。 */
export interface ClampInput {
  /** 既定位置（左端格納時）の左上座標(px・ビューポート基準)。 */
  baseX: number;
  baseY: number;
  /** 既定位置からの希望オフセット（ドラッグの生の移動量）。 */
  desiredDx: number;
  desiredDy: number;
  /** パネルの実寸(px)。 */
  panelWidth: number;
  panelHeight: number;
  /** ビューポート寸法(px)。 */
  viewportWidth: number;
  viewportHeight: number;
  /** 端の最小余白(px・パネルを画面端に貼り付けすぎない＝掴み代を残す)。既定 0。 */
  margin?: number;
}

/**
 * clampDrawerOffset はヘッダドラッグの希望オフセットを「画面外へ出さない」範囲へ丸める純関数（ADR-0029）。
 *
 * なぜ純関数か：位置クランプは可動ドロワーの本丸寄りの検証可能ロジック（ヘッダを乱暴に振ってもパネルの
 * つかみ手が画面外へ消えない＝再び掴めなくなる事故を防ぐ）。UI/ポインタ処理から切り離し jsdom で固める
 * （frontend-conventions §8・地図の見た目は層4だが座標計算はテスト可能）。
 *
 * 計算：既定左上(base)＋希望オフセット(desired)で左上を出し、[margin, viewport-panel-margin] へクランプして
 * 既定位置との差分（クランプ後オフセット）を返す。パネルがビューポートより大きい軸は左上＝margin に寄せる
 * （負の上限を 0 下限に潰し、はみ出し時も左上端が見える＝つかみ手を画面内に保つ）。
 *
 * @returns クランプ後の {dx,dy}（既定位置からのオフセット）。
 */
export function clampDrawerOffset(input: ClampInput): DrawerOffset {
  const {
    baseX,
    baseY,
    desiredDx,
    desiredDy,
    panelWidth,
    panelHeight,
    viewportWidth,
    viewportHeight,
    margin = 0,
  } = input;

  const wantX = baseX + desiredDx;
  const wantY = baseY + desiredDy;

  // 左上が取りうる範囲。パネルがビューポートより大きい軸は上限<下限になるため下限(margin)へ潰す
  // （= 左上端を画面内に保ち、はみ出しは右/下へ逃がす＝つかみ手＝左上ヘッダを必ず掴める）。
  const maxX = Math.max(margin, viewportWidth - panelWidth - margin);
  const maxY = Math.max(margin, viewportHeight - panelHeight - margin);

  const clampedX = Math.min(Math.max(wantX, margin), maxX);
  const clampedY = Math.min(Math.max(wantY, margin), maxY);

  return { dx: clampedX - baseX, dy: clampedY - baseY };
}
