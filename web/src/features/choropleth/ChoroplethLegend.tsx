import { useMemo } from "react";
import { choroplethFillLegend } from "../../styles/mapTokens";
import { findMetric } from "./metrics";
import { useChoroplethValues } from "./useChoroplethValues";

/**
 * ChoroplethLegend は面塗りの最小の凡例（色段＋値域）を出す（DESIGN §2 凡例・タスク 4）。
 *
 * 地図の色式と同じ stops（choroplethFillLegend）から作るため、凡例と地図の色は必ず一致する
 * （二重管理しない・mapTokens に集約）。過剰なUIにしない＝色帯と両端の値・単位・出典のみ。
 * 値が無い間（取得前/全データなし）は出さない（基図を邪魔しない）。
 *
 * @param metric 表示中の指標キー（タイトル/単位を metrics.ts から引く・面塗りと同じ指標を渡す）。
 */
export function ChoroplethLegend({ metric }: { metric: string }) {
  const { data: values } = useChoroplethValues(metric);

  const range = useMemo(() => {
    const nums = (values ?? [])
      .filter((v) => v.status === "present" && v.value !== null)
      .map((v) => v.value as number);
    if (nums.length === 0) {
      return null;
    }
    return { min: Math.min(...nums), max: Math.max(...nums) };
  }, [values]);

  if (!range) {
    return null;
  }

  const label = findMetric(metric);
  const stops = choroplethFillLegend(range.min, range.max);

  return (
    <div
      // 地図右下に薄く重ねる（操作を妨げないが読める）。色・タイポは DESIGN のスレート系に寄せる。
      style={{
        position: "absolute",
        bottom: 24,
        right: 8,
        padding: "8px 10px",
        borderRadius: 4,
        background: "rgba(255,255,255,0.9)",
        font: "12px/1.4 system-ui, sans-serif",
        color: "#334155",
        zIndex: 1,
        maxWidth: 220,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{label?.title ?? metric}</div>
      {/* 色帯：薄→濃。stops の色をそのまま並べる（地図と同一）。 */}
      <div style={{ display: "flex", height: 10, marginBottom: 2 }}>
        {stops.map((s) => (
          <div key={s.color} style={{ flex: 1, background: s.color }} />
        ))}
      </div>
      {/* 両端の値（min / max）と単位。中間目盛りは過剰なので置かない（最小の凡例）。 */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{formatValue(range.min, label?.fractionDigits ?? 1)}</span>
        <span>
          {formatValue(range.max, label?.fractionDigits ?? 1)} {label?.unit ?? ""}
        </span>
      </div>
      {/* 出典（法的要件・ADR-0011／frontend-conventions §5）。指標ごとに metrics.ts から引く。 */}
      <div style={{ marginTop: 4, fontSize: 10, color: "#64748b" }}>{label?.source ?? ""}</div>
    </div>
  );
}

/** 凡例の値整形：桁を抑えて読みやすく（面積=小数1桁／乗降客数=整数）。指標ごとの桁数で丸める。 */
function formatValue(n: number, fractionDigits: number): string {
  return n.toLocaleString("ja-JP", { maximumFractionDigits: fractionDigits });
}
