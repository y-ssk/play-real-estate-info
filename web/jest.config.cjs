// Jest＋ts-jest（ADR-0013：テスト＝Jest＋RTL・ビルドツールから独立）。
// なぜ .cjs か：package.json が "type":"module" のため、設定を CommonJS と明示し
// ts-node 依存を増やさず読み込ませる（周辺は薄く）。
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  // CSS の import（maplibre-gl.css 等）はテストで意味を持たないためスタブ化する。
  moduleNameMapper: {
    "\\.(css)$": "<rootDir>/src/test/styleMock.ts",
  },
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
};
