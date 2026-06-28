import { render, screen } from "@testing-library/react";
import { Skeleton } from "./Skeleton";

// melta skeleton.md のアクセシビリティ（aria-busy/role=status・sr-only）と脈動クラスが当たることを確かめる。
// 色トークン（var(--color-skeleton)）は jsdom が CSSOM で var() を捨てるため computed style では検証できない
// ＝層4目視に委ねる。ここは退行しやすい a11y 属性と pulse クラスの配線を守る。
describe("Skeleton", () => {
  it("role=status・aria-busy=true・sr-only テキスト・脈動クラスを持つ（melta §5）", () => {
    render(<Skeleton label="名称を読み込み中" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveClass("skeleton-pulse");
    // sr-only の読み上げテキスト（アクセシブルネームに乗る）。
    expect(screen.getByText("名称を読み込み中")).toHaveClass("sr-only");
  });

  it("circle variant は正円（borderRadius 50%・height 未指定なら width 流用）", () => {
    render(<Skeleton variant="circle" width={32} label="読込中" />);
    const status = screen.getByRole("status");
    expect(status.style.borderRadius).toBe("50%");
    expect(status.style.width).toBe("32px");
    expect(status.style.height).toBe("32px");
  });
});
