import { render } from "@testing-library/react";
import { Panel } from "./Panel";

// surface 面の器が子を描き、利用側の style 上書き（KartePanel が border/radius を寄せる）を反映することを確かめる。
// 色トークン（var(--color-surface) 等）は jsdom の CSSOM が var() を捨てるため computed style で検証できない
// ＝層4の目視で確かめる。ここは退行しやすい「子の描画」「非 var の style 後勝ち」を守る。
describe("Panel", () => {
  it("子を描き、渡した非 var の style を後勝ちで反映する", () => {
    const { getByTestId } = render(
      <Panel data-testid="panel" style={{ padding: 8 }}>
        <span>中身</span>
      </Panel>,
    );
    const panel = getByTestId("panel");
    expect(panel.style.padding).toBe("8px");
    expect(panel.textContent).toBe("中身");
  });
});
