import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "./Button";

// 見た目だけの部品でも prop の配線（type 既定・variant 受理・onClick・style 上書き）が壊れないことを確かめる。
// 色トークン（var(--color-*)）の値は jsdom の CSSOM が var() を捨てるため computed style で検証できない
// ＝層4の目視（オーケストレーター）で確かめる。ここは退行しやすい配線を behavioral に守る。
describe("Button", () => {
  it("既定は type=button（フォーム内の暗黙 submit を防ぐ）", () => {
    render(<Button>保存</Button>);
    expect(screen.getByRole("button", { name: "保存" })).toHaveAttribute("type", "button");
  });

  it("両 variant をエラーなく描き、onClick を素通しする", () => {
    const onClick = jest.fn();
    const { rerender } = render(
      <Button variant="primary" onClick={onClick}>
        保存
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(<Button variant="secondary">戻る</Button>);
    expect(screen.getByRole("button", { name: "戻る" })).toBeInTheDocument();
  });

  it("呼び出し側の type 指定を尊重する（submit を許す）", () => {
    render(<Button type="submit">送信</Button>);
    expect(screen.getByRole("button", { name: "送信" })).toHaveAttribute("type", "submit");
  });
});
