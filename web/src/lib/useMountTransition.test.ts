import { act, renderHook, waitFor } from "@testing-library/react";
import { useMountTransition } from "./useMountTransition";

// 出のアニメ（マウント保持）が効くこと＝条件レンダリングのままだと出が即時になる問題の退行防止。
describe("useMountTransition", () => {
  it("open=true で即描画、open=false で duration ぶん描画を残してからアンマウントする", async () => {
    const { result, rerender } = renderHook(({ open }) => useMountTransition(open, 50), {
      initialProps: { open: true },
    });

    // 入り：すぐ描画され、次フレームで表示状態（isVisible）へ遷移する。
    expect(result.current.shouldRender).toBe(true);
    await waitFor(() => expect(result.current.isVisible).toBe(true));

    // 閉じ：isVisible は即 false（終了スタイルへ）だが shouldRender は duration の間 true のまま。
    act(() => rerender({ open: false }));
    expect(result.current.isVisible).toBe(false);
    expect(result.current.shouldRender).toBe(true);

    // duration 経過後にアンマウント（描画を外す）。
    await waitFor(() => expect(result.current.shouldRender).toBe(false));
  });

  it("open=false 始まりは描画しない（③閉＝地図全面の初期状態）", () => {
    const { result } = renderHook(() => useMountTransition(false, 50));
    expect(result.current.shouldRender).toBe(false);
    expect(result.current.isVisible).toBe(false);
  });
});
