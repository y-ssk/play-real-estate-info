import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, CSSProperties } from "react";

/**
 * IconButton はアイコンのみの小ボタン（melta button.md「アイコンボタン」＋DESIGN §6 SVG アイコン）。
 *
 * アイコンは Lucide（SVG）のみ＝絵文字（機種依存文字）は使わない（DESIGN §6・frontend-conventions §4）。
 * 飾りでは足さず「必要なときだけ」（DESIGN §6）。生値は書かず意味/用途トークンを参照（ADR-0027/DESIGN §4）。
 * **`aria-label` は必須**（アイコンのみでは操作内容がスクリーンリーダーに伝わらない・prohibited.md/button.md）
 * ＝型で必須にして付け忘れを防ぐ。フォーカスリングは brand コーラル（DESIGN §1）。
 *
 * @param icon 表示する Lucide アイコン（コンポーネント）。
 * @param label 操作内容（aria-label・必須）。
 */
export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  icon: LucideIcon;
  label: string;
}

export function IconButton({ icon: Icon, label, style, ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} style={{ ...BUTTON_STYLE, ...style }} {...rest}>
      {/* Charcoal/Lucide は currentColor を継ぐ＝色は親のテキスト色で制御（DESIGN §6・色を別管理しない）。 */}
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

// --- スタイル（意味トークン参照・ADR-0027/DESIGN §4）。無地＝控えめ（閉じる等の副次操作）。 ---
const BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 0,
  borderRadius: "var(--radius-sm)",
  border: "none",
  background: "transparent",
  color: "var(--color-text-muted)",
  cursor: "pointer",
  flexShrink: 0,
  // フォーカスリング＝brand コーラル（prohibited.md「outline:none without ring」回避）。
  outlineColor: "var(--color-accent-emphasis)",
  outlineOffset: 1,
};
