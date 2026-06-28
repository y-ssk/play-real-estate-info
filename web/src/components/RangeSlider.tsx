import type { CSSProperties } from "react";

/**
 * RangeSlider は下限・上限を2つのつまみで指定する範囲スライダー（共通部品・絞り込みの条件入力・ADR-0028）。
 *
 * 3.5 で共通部品（Button/IconButton/Panel/Skeleton）を整備した方針に沿い、ここに新設する（機能側で生の
 * 見た目を作り込まない・frontend-conventions §4）。生値（hex）は書かず意味/用途トークンを参照し、差し色
 * コーラルはつまみ＝操作の点に限る（DESIGN §1／ADR-0027・色定義は CSS の .range-slider__input）。melta の
 * 禁止（全周ボーダー濫用・カラーバー等の AIっぽい装飾）は持ち込まない（prohibited.md）。
 *
 * 実装：標準の `<input type="range">` を2本重ね、下のつまみで min・上のつまみで max を掴む（独自描画でなく
 * ブラウザ標準を使い、キーボード操作・アクセシビリティを既定で得る）。つまみ以外はクリックを透過させ両方の
 * つまみを掴めるようにする（CSS の pointer-events・global.css）。**min が max を超えない**よう値はクランプして
 * 返す（呼び側＝store が境目の逆転を持たない・filtering の閉区間前提を壊さない）。
 *
 * @param min レンジ下端（指標の取りうる最小・スケールの左端）。
 * @param max レンジ上端（指標の取りうる最大・スケールの右端）。
 * @param step つまみの刻み。
 * @param valueMin 現在の下限つまみ位置。
 * @param valueMax 現在の上限つまみ位置。
 * @param onChange 下限/上限が変わったら呼ぶ（クランプ済みの {min,max} を渡す）。
 * @param ariaLabel スライダー群の説明（指標名など・スクリーンリーダー向け・必須）。
 */
export interface RangeSliderProps {
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  onChange: (next: { min: number; max: number }) => void;
  ariaLabel: string;
}

export function RangeSlider({
  min,
  max,
  step,
  valueMin,
  valueMax,
  onChange,
  ariaLabel,
}: RangeSliderProps) {
  // 逆転防止：下限つまみは上限を超えない／上限つまみは下限を下回らない（境目の逆転を store に持たせない）。
  const handleMin = (raw: number) => onChange({ min: Math.min(raw, valueMax), max: valueMax });
  const handleMax = (raw: number) => onChange({ min: valueMin, max: Math.max(raw, valueMin) });

  return (
    // 2本のレンジを重ねるため相対配置の器に絶対配置で積む（つまみ以外は透過＝両方掴める・global.css）。
    // group は fieldset で表す（a11y＝role="group" の素な div でなく意味要素・Biome useSemanticElements）。
    // 既定のボーダー/余白は消し、ラベルは legend を sr-only で読み上げにだけ残す（視覚はパネル側の指標名）。
    <fieldset style={WRAP_STYLE}>
      <legend className="sr-only">{ariaLabel}</legend>
      <input
        type="range"
        className="range-slider__input"
        style={INPUT_STYLE}
        min={min}
        max={max}
        step={step}
        value={valueMin}
        onChange={(e) => handleMin(Number(e.target.value))}
        aria-label={`${ariaLabel}の下限`}
      />
      <input
        type="range"
        className="range-slider__input"
        style={INPUT_STYLE}
        min={min}
        max={max}
        step={step}
        value={valueMax}
        onChange={(e) => handleMax(Number(e.target.value))}
        aria-label={`${ariaLabel}の上限`}
      />
    </fieldset>
  );
}

// --- スタイル（用途/意味トークン参照・色は global.css の .range-slider__input・ADR-0027/DESIGN §4）。 ---

// つまみが端で切れないよう上下に余白を取る器（2本重ねるため高さを確保）。fieldset 既定の枠/余白は消す。
const WRAP_STYLE: CSSProperties = {
  position: "relative",
  height: 16,
  margin: 0,
  padding: 0,
  border: "none",
  minInlineSize: "auto", // fieldset 既定の min-width:min-content を解除（親幅に収める）。
};

// 2本を同じ位置へ重ねる（下＝min・上＝max。つまみ以外は透過し下の本も掴める）。
const INPUT_STYLE: CSSProperties = {
  position: "absolute",
  top: 7,
  left: 0,
};
