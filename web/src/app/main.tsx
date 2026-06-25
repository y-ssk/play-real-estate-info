import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles/global.css";
import { App } from "./App";

// 起動（app 層）。プロバイダ（TanStack Query 等）は段1で状態を入れるときに足す（ADR-0018）。
const container = document.getElementById("root");
if (!container) {
  throw new Error("root 要素が見つかりません");
}
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
