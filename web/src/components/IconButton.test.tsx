import { render, screen } from "@testing-library/react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

// アイコンのみのボタンは aria-label 必須（型で強制・prohibited.md）。最小レンダリングで担保を確かめる。
describe("IconButton", () => {
  it("label を aria-label に出し、Lucide アイコン（SVG）を描く（絵文字不使用・DESIGN §6）", () => {
    const { container } = render(<IconButton icon={X} label="閉じる" />);
    const btn = screen.getByRole("button", { name: "閉じる" });
    expect(btn).toHaveAttribute("type", "button");
    // Lucide は SVG を描く＝機種依存の絵文字でないことの担保。
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
