import { createBaseStyle } from "./basemap";

// 段0 の本丸は「地図表現の下地」。下地 style の最小の正しさ（出典・SRID整合の前提・1枚敷く）を固める。
describe("createBaseStyle", () => {
  it("GSI 淡色ラスタを1枚だけ source/layer に持つ", () => {
    const style = createBaseStyle();
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toEqual(["gsi_pale"]);
    expect(style.layers).toHaveLength(1);
    expect(style.layers[0]?.id).toBe("gsi_pale");
  });

  it("出典に国土地理院を含む（ADR-0011 出典表示は法的要件）", () => {
    const style = createBaseStyle();
    const src = style.sources.gsi_pale;
    if (src === undefined || src.type !== "raster") {
      throw new Error("gsi_pale は raster source であるべき");
    }
    expect(src.attribution).toContain("国土地理院");
    expect(src.tiles?.[0]).toContain("cyberjapandata.gsi.go.jp/xyz/pale");
  });
});
