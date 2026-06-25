import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "../lib/queryClient";
import "../styles/global.css";
import { App } from "./App";

// 起動（app 層）。サーバ状態の取得は TanStack Query に委ねる（ADR-0018）。
const queryClient = createQueryClient();

const container = document.getElementById("root");
if (!container) {
  throw new Error("root 要素が見つかりません");
}
createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
