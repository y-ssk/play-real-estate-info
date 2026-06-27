import type { CSSProperties } from "react";

/**
 * Skeleton はローディング中のコンテンツ占有領域を示すプレースホルダ（melta skeleton.md）。
 *
 * 形状を予告して認知コストを下げ、実コンテンツ到着で即差し替える（melta §1）。色は slate-200 固定
 * （意味トークン {@link var} `--color-skeleton`・melta「スケルトンは slate-200 のみ」）。脈動は `.skeleton-pulse`
 * （1.5s・`prefers-reduced-motion` で停止＝global.css）。生 hex は書かずトークン参照（DESIGN §4）。
 *
 * アクセシビリティ（melta §5・prohibited.md）：コンテナに `aria-busy="true"` `role="status"` ＋ sr-only の
 * 「読み込み中」を出す。**実コンテンツ到着時は本コンポーネントを出さない（差し替える）こと**で aria-busy を解除する
 * （描画の出し分けが解除に相当・利用側の責務）。
 *
 * @param variant 形（既定 bar＝テキスト行 / circle＝アバター等）。
 * @param width 幅（CSS 値。bar の行長。既定 100%）。
 * @param height 高さ（CSS 値。既定は bar=14px。circle は width に合わせ正円化）。
 * @param label sr-only の読み上げテキスト（既定「読み込み中」）。
 */
export interface SkeletonProps {
  variant?: "bar" | "circle";
  width?: number | string;
  height?: number | string;
  label?: string;
  style?: CSSProperties;
}

export function Skeleton({
  variant = "bar",
  width,
  height,
  label = "読み込み中",
  style,
}: SkeletonProps) {
  const isCircle = variant === "circle";
  // circle は width に合わせ正円（height 未指定なら width を流用）。bar は行高の既定を持つ。
  const resolvedWidth = width ?? (isCircle ? 40 : "100%");
  const resolvedHeight = height ?? (isCircle ? resolvedWidth : 14);
  return (
    // コンテナ自体が脈動する面（バー/円）＝role=status の生きた領域。sr-only テキストを内包する。
    // melta skeleton.md がスケルトンの器に role="status" の div を規定（<output> は計算結果用で意味が合わない）。
    // DESIGN/melta を正とし、Biome の useSemanticElements はここだけ仕様優先で抑制する。
    // biome-ignore lint/a11y/useSemanticElements: melta skeleton.md 準拠（role=status の div・上のコメント参照）
    <div
      role="status"
      aria-busy="true"
      className="skeleton-pulse"
      style={{
        ...BASE_STYLE,
        width: resolvedWidth,
        height: resolvedHeight,
        borderRadius: isCircle ? "50%" : "var(--radius-md)",
        ...style,
      }}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
}

// --- スタイル（意味トークン参照・DESIGN §4。色は slate-200＝melta 固定）。 ---
const BASE_STYLE: CSSProperties = {
  display: "block",
  background: "var(--color-skeleton)",
};
