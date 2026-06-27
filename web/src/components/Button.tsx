import type { ButtonHTMLAttributes, CSSProperties } from "react";

/**
 * Button は共通のボタン部品（melta-ui button.md 指針＋DESIGN §1 差し色コーラル）。
 *
 * 生値（hex）は書かず用途/意味トークンだけ参照する（DESIGN §4・ADR-0027）。機能側はこの部品を使い、
 * 自前で見た目を作り込まない（frontend-conventions §4）。melta の禁止（全周ボーダー濫用・カラーバー等の
 * AIっぽい装飾）は持ち込まない（prohibited.md）。フォーカスリングは brand コーラル（DESIGN §1・
 * 文字を載せない強調＝accent-emphasis）。
 *
 * variant：
 * - `primary`＝操作の主役（コーラル action 背景＋白文字）。melta Contained 相当。1画面で点使い（DESIGN §1）。
 * - `secondary`＝控えめな副次操作（無地＋スレート枠）。melta Outlined 相当。
 *
 * @param variant 見た目の階層（既定 secondary＝控えめ）。
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({ variant = "secondary", style, ...rest }: ButtonProps) {
  // type は呼び出し側の明示が無ければ "button"（フォーム内の暗黙 submit を防ぐ）。
  const variantStyle = variant === "primary" ? PRIMARY_STYLE : SECONDARY_STYLE;
  return <button type="button" style={{ ...BASE_STYLE, ...variantStyle, ...style }} {...rest} />;
}

// --- スタイル（用途/意味トークン参照。生値は書かない＝ADR-0027/DESIGN §4）。 ---

// melta button.md：4px グリッドの余白・ラベルが読める文字・状態のフィードバック。
// フォーカスは outline で brand リング（prohibited.md「outline:none without ring」回避）。
const BASE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "4px 12px",
  borderRadius: "var(--radius-sm)",
  font: "var(--text-caption)",
  cursor: "pointer",
  // フォーカスリング＝brand コーラル（文字を載せない強調・DESIGN §1）。
  outlineColor: "var(--color-accent-emphasis)",
  outlineOffset: 1,
};

// primary＝コーラル action 背景＋白文字（melta Contained・DESIGN §1 action）。
const PRIMARY_STYLE: CSSProperties = {
  background: "var(--color-accent)",
  color: "var(--color-accent-text)",
  border: "1px solid var(--color-accent)",
  fontWeight: 600,
};

// secondary＝無地＋スレート枠（melta Outlined・黒子）。差し色は使わない（点使いを保つ）。
const SECONDARY_STYLE: CSSProperties = {
  background: "transparent",
  color: "var(--color-text)",
  border: "1px solid var(--color-border-strong)",
  fontWeight: 400,
};
