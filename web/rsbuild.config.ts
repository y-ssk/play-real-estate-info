import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";

// Rsbuild 設定（ADR-0013：ビルド＝Rsbuild/Rspack）。
// 開発は Rsbuild 開発サーバ、本番は dist を Go が embed 配信する二段構え。
export default defineConfig({
  plugins: [pluginReact()],
  html: {
    title: "MachiLens",
    template: "./src/app/index.html",
  },
  source: {
    entry: { index: "./src/app/main.tsx" },
  },
  output: {
    // Go の embed が拾う出力先（embed.go の go:embed all:web/dist と対）。
    distPath: { root: "dist" },
  },
  server: {
    port: 3000,
    // /api を Go サーバ（既定 :8080）へ転送する＝開発時の一体型の代用（ADR-0013 二段構え）。
    proxy: {
      "/api": "http://localhost:8080",
    },
  },
});
