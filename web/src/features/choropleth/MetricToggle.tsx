import type { CSSProperties } from "react";
import { METRICS, METRIC_ORDER } from "./metrics";

/**
 * MetricToggle は面塗りの指標を切り替える最小トグル（地図左上に重ねる・DESIGN §2 レイヤー切替）。
 *
 * 指標の並びは {@link METRIC_ORDER}・表示名は {@link METRICS} から引く（指標追加はトグル無改修で増える）。
 * 選択は親（App）が持つ UI 状態を `onChange` で更新する（状態の真実は親・frontend-conventions §3）。
 *
 * 色：選択中＝差し色コーラル action（白文字が乗る面・DESIGN §1／ADR-0027 で hex 確定＝従来の保留を解消）。
 * 非選択＝黒子のスレート枠（据え置き）。生値は書かず意味トークンを参照（DESIGN §4）。差し色は「点」使い＝
 * 選択中の1個だけが色付く（DESIGN §1）。色だけで状態を伝えず font-weight も併用（prohibited.md/button.md）。
 *
 * @param metric 選択中の指標キー。
 * @param onChange 指標キーを切り替えるコールバック。
 */
export function MetricToggle({
  metric,
  onChange,
}: {
  metric: string;
  onChange: (metric: string) => void;
}) {
  return (
    <div
      // 地図左上（ズーム表示の下）。操作要素ゆえ pointerEvents は既定（押せる）。
      style={CONTAINER_STYLE}
    >
      {METRIC_ORDER.map((key) => {
        const def = METRICS[key];
        if (!def) {
          return null;
        }
        const active = key === metric;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={active}
            style={active ? ACTIVE_STYLE : INACTIVE_STYLE}
          >
            {def.title}
          </button>
        );
      })}
    </div>
  );
}

// --- スタイル（意味/用途トークン参照・ADR-0027/DESIGN §4）。 ---

const CONTAINER_STYLE: CSSProperties = {
  position: "absolute",
  top: 40,
  left: 8,
  display: "flex",
  gap: 4,
  padding: 4,
  borderRadius: "var(--radius-md)",
  // 半透明の白面で地図に重ねる（基図を透かす）。surface は不透明トークンゆえここは固定値で薄く乗せる。
  background: "rgba(255,255,255,0.9)",
  zIndex: 1,
};

const BUTTON_BASE: CSSProperties = {
  padding: "4px 10px",
  borderRadius: "var(--radius-sm)",
  font: "var(--text-caption)",
  cursor: "pointer",
  // フォーカスリング＝brand コーラル（DESIGN §1・prohibited.md「outline:none without ring」回避）。
  outlineColor: "var(--color-accent-emphasis)",
  outlineOffset: 1,
};

// 選択中＝コーラル action 背景＋白文字（DESIGN §1 差し色の「点」使い）。
const ACTIVE_STYLE: CSSProperties = {
  ...BUTTON_BASE,
  border: "1px solid var(--color-accent)",
  background: "var(--color-accent)",
  color: "var(--color-accent-text)",
  fontWeight: 600,
};

// 非選択＝黒子のスレート枠・無地（据え置き）。
const INACTIVE_STYLE: CSSProperties = {
  ...BUTTON_BASE,
  border: "1px solid var(--color-border-strong)",
  background: "transparent",
  color: "var(--color-text)",
  fontWeight: 400,
};
