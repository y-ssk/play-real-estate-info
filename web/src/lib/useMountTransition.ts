import { useEffect, useRef, useState } from "react";

/**
 * useMountTransition は「マウント/アンマウントに入り・出のアニメをかける」最小フック（DESIGN モーション節）。
 *
 * なぜ要るか：条件レンダリング（`open ? <Panel/> : null`）のままだと、閉じた瞬間に DOM が消え**出のアニメが
 * 効かない**。本フックは open=false になっても `duration` ぶんだけ描画を残してからアンマウントし、その間に
 * 終了側のスタイル（フェードアウト・スライドアウト）を当てられるようにする。④⑤のパネル/ボトムシートでも
 * 再利用できるよう lib/（共有層・frontend-conventions §1）に置く。
 *
 * 使い方：`shouldRender` が真の間だけ要素を描画し、`isVisible` で入り/出のスタイルを切り替える。
 * - 入り：マウント直後の1フレームは `isVisible=false`（初期＝画面外/透明）→次フレームで `true`（遷移開始）。
 * - 出 ：open=false で `isVisible=false`（終了スタイルへ遷移）→`duration` 後に `shouldRender=false`（除去）。
 * `prefers-reduced-motion` 時の即時化は CSS 側（global.css で transition を実質0）に委ね、ここは時間管理に徹する。
 *
 * @param open 表示したいか（選択あり等）。
 * @param duration 出のアニメを待つミリ秒（既定 200＝`--motion-base` と揃える）。
 * @returns `shouldRender`（DOM に出すか）と `isVisible`（遷移後の表示状態か）。
 */
export function useMountTransition(
  open: boolean,
  duration = 200,
): { shouldRender: boolean; isVisible: boolean } {
  const [shouldRender, setShouldRender] = useState(open);
  const [isVisible, setIsVisible] = useState(false);
  // 二重 rAF のキャンセル用（入りの初期フレーム確定前にアンマウントされたらリークさせない）。
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      // 入り：まず DOM に出す（初期＝非表示スタイル）→次フレームで表示へ遷移させる（遷移を発火させるため
      // 一度ブラウザに初期状態を描かせる＝rAF を2段）。
      setShouldRender(true);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => setIsVisible(true));
      });
      return () => {
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
        }
      };
    }
    // 出：終了スタイルへ遷移させ（isVisible=false）、duration 後に DOM から除去する。
    setIsVisible(false);
    const timer = setTimeout(() => setShouldRender(false), duration);
    return () => clearTimeout(timer);
  }, [open, duration]);

  return { shouldRender, isVisible };
}
