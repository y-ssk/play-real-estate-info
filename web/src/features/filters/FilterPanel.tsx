import { SlidersHorizontal } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "../../components/Button";
import { RangeSlider } from "../../components/RangeSlider";
import { useFilterStore } from "../../lib/filterStore";
import type { MetricCondition } from "../../lib/filtering";
import { METRICS, METRIC_ORDER } from "../choropleth/metrics";
import type { MetricRange } from "./useFilterMatch";

/**
 * FilterPanel は指標ごとの範囲スライダーで絞り込み条件を入力するパネル（④・ADR-0028）。
 *
 * **一覧表は持たない**（dead-end 根絶・ADR-0028）：条件を立てると地図が該当区を強調し（別チャネル・
 * ChoroplethLayer）、該当区クリックで既存カルテ（③）が開く＝「広く探す→ピン→比較」の探す段に徹する。
 * 並べ替え（F7）はここに出さない（#6 ピン一覧へ移設・ADR-0028）。条件は AND・重みづけしない（ADR-0012）。
 *
 * 各指標は値域 [min,max]（present 値の幅）を両端に持つ範囲スライダー（共通部品 {@link RangeSlider}）で
 * 下限/上限を指定する。値は `filterStore`（Zustand）に持つ（状態の真実は store・地図ハイライトは描画の鏡・§3）。
 * 値域いっぱい（両端と一致）の条件は「絞っていない」と見なし条件を外す＝空条件を溜めない（store の方針）。
 *
 * 見た目：surface の半透明パネルを地図右下に重ねる（カルテ＝右側固定／トグル＝左上 と衝突しない位置）。
 * 見出しアイコンは Lucide（絵文字不使用・DESIGN §6）。差し色コーラルはつまみとリセットの主操作だけ（点使い・§1）。
 * 生値は書かず意味/用途トークンを参照（ADR-0027/DESIGN §4）。
 *
 * @param rangesByMetric 指標キー→値域（スライダー両端）。値の無い指標はスライダーを出さない。
 */
export function FilterPanel({ rangesByMetric }: { rangesByMetric: Record<string, MetricRange> }) {
  const conditions = useFilterStore((s) => s.conditions);
  const setCondition = useFilterStore((s) => s.setCondition);
  const clearConditions = useFilterStore((s) => s.clearConditions);

  // 値域がそろっている指標だけ出す（値未取得・全データなしの指標はスライダーを出せない）。
  const shown = METRIC_ORDER.filter((key) => rangesByMetric[key] !== undefined);
  const hasAnyCondition = Object.values(conditions).some(
    (c) => c.min !== undefined || c.max !== undefined,
  );

  if (shown.length === 0) {
    return null; // 値がまだ無い＝絞り込み UI を出さない（壊れたパネルを出さない）。
  }

  return (
    <section style={PANEL_STYLE} aria-label="絞り込み">
      <header style={HEADER_STYLE}>
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span style={TITLE_STYLE}>条件で絞り込む</span>
      </header>

      {shown.map((key) => {
        const def = METRICS[key];
        const range = rangesByMetric[key];
        if (!def || !range) {
          return null;
        }
        return (
          <MetricFilterRow
            key={key}
            metricKey={key}
            title={def.title}
            unit={def.unit}
            format={def.format}
            range={range}
            condition={conditions[key]}
            onChange={(cond) => setCondition(key, cond)}
          />
        );
      })}

      <div style={FOOTER_STYLE}>
        <Button variant="secondary" onClick={clearConditions} disabled={!hasAnyCondition}>
          条件をリセット
        </Button>
      </div>
    </section>
  );
}

/**
 * MetricFilterRow は1指標ぶんの範囲スライダー＋現在値ラベル（内部部品）。
 *
 * 値域いっぱい（両端＝min/max と一致）なら「制約なし」として min/max を undefined で返す＝store が空条件を
 * 溜めない（FilterPanel の doc 参照）。片側でも値域から内側なら数値を渡す（その向きだけ絞る）。
 */
function MetricFilterRow({
  metricKey,
  title,
  unit,
  format,
  range,
  condition,
  onChange,
}: {
  metricKey: string;
  title: string;
  unit: string;
  format: (value: number) => string;
  range: MetricRange;
  condition: MetricCondition | undefined;
  onChange: (cond: MetricCondition) => void;
}) {
  // 現在のつまみ位置＝条件があればその値、なければ値域の両端（＝絞っていない）。
  const valueMin = condition?.min ?? range.min;
  const valueMax = condition?.max ?? range.max;
  // 刻み：値域を100分割（増減率の小数〜面積の整数いずれも操作できる粒度）。0幅は1で割れ防止。
  const span = range.max > range.min ? range.max - range.min : 1;
  const step = span / 100;

  const handle = (next: { min: number; max: number }) => {
    // 値域の端と一致＝その向きは絞らない（undefined）。store はそれを空条件として取り除く。
    const min = next.min <= range.min ? undefined : next.min;
    const max = next.max >= range.max ? undefined : next.max;
    onChange({ min, max });
  };

  const unitSuffix = unit ? ` ${unit}` : "";

  return (
    <div style={ROW_STYLE}>
      <div style={ROW_LABEL_STYLE}>
        <span style={ROW_TITLE_STYLE}>{title}</span>
        <span style={ROW_VALUE_STYLE}>
          {/* %・符号付き表示は registry の format に従う（#42 層4指摘 (3)・増減率は formatPercentSigned）。 */}
          {format(valueMin)}
          {unitSuffix} 〜 {format(valueMax)}
          {unitSuffix}
        </span>
      </div>
      <RangeSlider
        ariaLabel={title}
        min={range.min}
        max={range.max}
        step={step}
        valueMin={valueMin}
        valueMax={valueMax}
        onChange={handle}
      />
      {/* metricKey はテスト・将来の出典表示の足がかり（条件の出所を辿れる）。 */}
      <span className="sr-only">{`指標キー: ${metricKey}`}</span>
    </div>
  );
}

// --- スタイル（意味/用途トークン参照・ADR-0027/DESIGN §4）。 ---

const PANEL_STYLE: CSSProperties = {
  position: "absolute",
  right: 8,
  bottom: 8,
  width: 280,
  maxWidth: "calc(100vw - 16px)",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  color: "var(--color-text)",
  zIndex: 1,
};

// 見出しは固定（スクロールしても動かない＝#42 層4指摘 (6)・パネル自体が短く内部スクロールを持たない構成）。
const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "var(--color-text-strong)",
};

const TITLE_STYLE: CSSProperties = {
  font: "var(--text-heading)",
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const ROW_LABEL_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const ROW_TITLE_STYLE: CSSProperties = {
  font: "var(--text-caption)",
  color: "var(--color-text-label)",
};

const ROW_VALUE_STYLE: CSSProperties = {
  font: "var(--text-data)",
  color: "var(--color-text)",
};

const FOOTER_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};
