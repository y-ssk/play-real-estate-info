import { useMemo } from "react";
import { choroplethFillLegend, divergingFillLegend } from "../../styles/mapTokens";
import { DEFAULT_METRIC, METRICS, sequentialFillRamp } from "./metrics";
import { useChoroplethValues } from "./useChoroplethValues";

/**
 * ChoroplethLegend は面塗りの最小の凡例（色段＋値域＋出典）を出す（DESIGN §2 凡例・タスク 4）。
 *
 * 地図の色式と同じ stops（{@link choroplethFillLegend}／{@link divergingFillLegend}）から作るため、凡例と
 * 地図の色は必ず一致する（二重管理しない・mapTokens に集約）。配色方式は指標定義（{@link METRICS}）の
 * `scale` で分岐：量＝逐次（薄→濃・両端値）／符号付き＝発散（**中央0%** を境に減少↔増加・両端値＋中央0）。
 * 表示名・単位・整形・出典は指標定義から引く（推計は出典に「推計」を明示・ADR-0009/0011）。
 * 値が無い間（取得前/全データなし）は出さない（基図を邪魔しない）。
 *
 * @param metric 表示中の指標キー（{@link ChoroplethLayer} と同じ値を渡す）。未指定は {@link DEFAULT_METRIC}。
 */
export function ChoroplethLegend({ metric = DEFAULT_METRIC }: { metric?: string }) {
  const { data: values } = useChoroplethValues(metric);
  const def = METRICS[metric];

  const range = useMemo(() => {
    const nums = (values ?? [])
      .filter((v) => v.status === "present" && v.value !== null)
      .map((v) => v.value as number);
    if (nums.length === 0) {
      return null;
    }
    return { min: Math.min(...nums), max: Math.max(...nums) };
  }, [values]);

  if (!range || !def) {
    return null;
  }

  const isDiverging = def.scale === "diverging";
  // 逐次は指標の色相ランプ（`ADR-0032`＝緑/相場・紫/将来・灰/基盤）で凡例を作る＝地図（ChoroplethLayer）と
  // 同じランプ・同じ stops ゆえ凡例と地図の色が必ず一致する（二重管理しない）。
  const stops = isDiverging
    ? divergingFillLegend(range.min, range.max)
    : choroplethFillLegend(range.min, range.max, sequentialFillRamp(def));
  // 凡例の両端ラベル：発散は対称ドメイン（stops 先頭=最小負側・末尾=最大正側）の実値を出し、0 が中央に来る
  // ことを「中央0%」ラベルで明示する（推計の符号がどちら向きか読者に分からせる）。
  const lowLabel = def.format(stops[0]?.lowerBound ?? range.min);
  const highLabel = def.format(stops[stops.length - 1]?.lowerBound ?? range.max);

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
        maxWidth: 240,
      }}
    >
      <div style={{ marginBottom: 4, fontWeight: 600 }}>{def.title}</div>
      {/* 色帯：stops の色をそのまま並べる（地図と同一）。発散も逐次も同じ並べ方（左→右）。 */}
      <div style={{ display: "flex", height: 10, marginBottom: 2 }}>
        {stops.map((s) => (
          <div key={s.color} style={{ flex: 1, background: s.color }} />
        ))}
      </div>
      {/* 両端の値（と単位）。発散は中央に 0% も出し「ここが境」を明示する。 */}
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{lowLabel}</span>
        {isDiverging && <span>0%</span>}
        <span>
          {highLabel} {def.unit}
        </span>
      </div>
      {/* 出典（法的要件・ADR-0011／frontend-conventions §5）。推計は「推計」を明示（ADR-0009）。 */}
      <div style={{ marginTop: 4, fontSize: 10, color: "#64748b" }}>{def.source}</div>
    </div>
  );
}
