import type { CSSProperties, HTMLAttributes } from "react";

/**
 * Panel は surface 面の素の容器（melta-ui card.md 指針）。カルテ等が内側で使うカード的コンテナ。
 *
 * surface 背景＋border＋radius だけを持つ最小の器（DESIGN §2 開いた状態の収束面）。中身の余白・配置は
 * 利用側が決める（1カード1コンテキスト＝melta card.md）。生値は書かず意味/用途トークンを参照する
 * （DESIGN §4・ADR-0027）。カード上部/左端のカラーバーや全周の濃い枠は付けない（AIっぽい装飾の禁止・
 * prohibited.md）。`as` は使わず素の div＝必要なら利用側が role/aria を渡す（KartePanel は aside で包む）。
 */
export type PanelProps = HTMLAttributes<HTMLDivElement>;

export function Panel({ style, ...rest }: PanelProps) {
  return <div style={{ ...PANEL_STYLE, ...style }} {...rest} />;
}

// --- スタイル（意味トークン参照・ADR-0027/DESIGN §4）。melta card.md：surface＋淡い border＋radius。 ---
const PANEL_STYLE: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  color: "var(--color-text)",
};
