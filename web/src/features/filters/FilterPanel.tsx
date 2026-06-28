import { GripHorizontal, SlidersHorizontal, X } from "lucide-react";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useRef } from "react";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { RangeSlider } from "../../components/RangeSlider";
import {
  type DrawerOffset,
  clampDrawerOffset,
  useFilterDrawerStore,
} from "../../lib/filterDrawerStore";
import { useFilterStore } from "../../lib/filterStore";
import type { MetricCondition } from "../../lib/filtering";
import { useMountTransition } from "../../lib/useMountTransition";
import { METRICS, METRIC_ORDER } from "../choropleth/metrics";
import type { MetricRange } from "./useFilterMatch";

/** ドロワー開閉アニメの所要（--motion-base=200ms と揃える＝出のアンマウント待ち・KartePanel と対称）。 */
const PANEL_MOTION_MS = 200;
/** パネル幅と既定の左上余白（左端ドロワーの格納位置＝この位置から開閉スライドし、ここを掴み移動の基準にする）。 */
const PANEL_WIDTH = 280;
const PANEL_MARGIN = 8;

/**
 * FilterPanel は指標ごとの範囲スライダーで絞り込み条件を入力する**左端の可動ドロワー**（④・ADR-0028/0029）。
 *
 * **可動ドロワー（ADR-0029・DESIGN §2）**：左端に格納し、ハンドル/ボタンで開閉する。開くと左端から
 * スライドして出（{@link useMountTransition} で出のアニメも見せる＝KartePanel の右スライドと対称の左スライド・
 * `--motion-base`・`prefers-reduced-motion` 尊重）、閉じれば地図が全面に戻る（絞り込み中も地図が主役・ADR-0028）。
 * 開いた後は**ヘッダ（つかみ手）をドラッグして任意位置へ移動**できる。**本体（中身＝スライダー等）のドラッグは
 * 止めず地図のパンへ通す**＝移動はヘッダでのみ起こし地図操作を奪わない（pointerdown はヘッダだけで捕捉・下記）。
 * カルテは右端固定ゆえ左に置き取り合わない（左=探索の可動／右=収束の固定・ADR-0029）。
 *
 * **一覧表は持たない**（dead-end 根絶・ADR-0028）：条件を立てると地図が該当区を強調し（別チャネル・
 * ChoroplethLayer）、該当区クリックで既存カルテ（③）が開く＝「広く探す→ピン→比較」の探す段に徹する。
 * 並べ替え（F7）はここに出さない（#6 ピン一覧へ移設・ADR-0028）。条件は AND・重みづけしない（ADR-0012）。
 *
 * 値は `filterStore`（条件＝Zustand）、開閉・位置は `filterDrawerStore`（器の置き方＝Zustand・ADR-0018）に
 * 分けて持つ（状態の真実は store・地図ハイライトは描画の鏡・§3）。各指標は値域 [min,max] を両端に持つ
 * 範囲スライダー（共通部品 {@link RangeSlider}）で下限/上限を指定。値域いっぱいの条件は外す＝空条件を溜めない。
 *
 * 見た目：surface の半透明パネル。見出しアイコンは Lucide（絵文字不使用・DESIGN §6）。差し色コーラルは
 * つまみとリセットの主操作だけ（点使い・§1）。生値は書かず意味/用途トークンを参照（ADR-0027/DESIGN §4）。
 *
 * @param rangesByMetric 指標キー→値域（スライダー両端）。値の無い指標はスライダーを出さない。
 */
export function FilterPanel({ rangesByMetric }: { rangesByMetric: Record<string, MetricRange> }) {
  const conditions = useFilterStore((s) => s.conditions);
  const setCondition = useFilterStore((s) => s.setCondition);
  const clearConditions = useFilterStore((s) => s.clearConditions);

  const isOpen = useFilterDrawerStore((s) => s.isOpen);
  const offset = useFilterDrawerStore((s) => s.offset);
  const close = useFilterDrawerStore((s) => s.close);
  const setOffset = useFilterDrawerStore((s) => s.setOffset);

  // 開閉アニメの時間管理（クローズ後も PANEL_MOTION_MS は描画を残し出のスライドを見せる・KartePanel と同型）。
  const { shouldRender, isVisible } = useMountTransition(isOpen, PANEL_MOTION_MS);

  // ヘッダドラッグ：掴んだ瞬間のポインタ座標と、その時点の浮かせ量を控え、移動量を offset に積む。
  // ref に持つ＝ドラッグ中の値で再描画を起こさない（座標更新は setOffset 経由・store が真実）。
  const dragRef = useRef<{ startX: number; startY: number; baseOffset: DrawerOffset } | null>(null);

  // 値域がそろっている指標だけ出す（値未取得・全データなしの指標はスライダーを出せない）。
  const shown = METRIC_ORDER.filter((key) => rangesByMetric[key] !== undefined);
  const hasAnyCondition = Object.values(conditions).some(
    (c) => c.min !== undefined || c.max !== undefined,
  );

  if (shown.length === 0) {
    return null; // 値がまだ無い＝絞り込み UI を出さない（壊れたパネルを出さない）。
  }
  // 閉じきってアニメも残っていなければ何も出さない＝地図全面（左端ドロワーの「閉」・ADR-0029）。
  if (!shouldRender) {
    return null;
  }

  // ヘッダ掴み：pointerdown をヘッダだけで捕捉し、setPointerCapture でドラッグ中の move/up を取りこぼさない。
  // **ここでだけ伝播を止める**＝ヘッダ操作は地図へ流さない。中身（スライダー等）には付けない＝本体ドラッグは
  // そのまま地図のパンへ通る（ADR-0029 構造的にヘッダのみ移動を起こす）。
  const onHeaderPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    // 主ボタン以外（右/中クリック）では掴まない。
    if (e.button !== 0) {
      return;
    }
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseOffset: offset ?? { dx: 0, dy: 0 },
    };
  };

  const onHeaderPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    e.stopPropagation();
    // 掴んだ点からの移動量＋掴み始めの浮かせ量を希望オフセットとし、画面外へ出さないようクランプ（純関数）。
    const desiredDx = drag.baseOffset.dx + (e.clientX - drag.startX);
    const desiredDy = drag.baseOffset.dy + (e.clientY - drag.startY);
    setOffset(
      clampDrawerOffset({
        baseX: PANEL_MARGIN,
        baseY: PANEL_MARGIN,
        desiredDx,
        desiredDy,
        panelWidth: PANEL_WIDTH,
        // 実高さはレイアウト依存ゆえビューポート高で近似的に上限を作る（つかみ手＝左上を画面内に保てれば十分）。
        panelHeight: window.innerHeight * 0.6,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        margin: PANEL_MARGIN,
      }),
    );
  };

  const onHeaderPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current) {
      return;
    }
    e.stopPropagation();
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  };

  return (
    // 左端の可動ドロワー。位置は既定（左端格納）＋浮かせ量(offset)。isVisible で左からの入り/出スライドを切替。
    <section style={panelStyle(isVisible, offset)} aria-label="絞り込み">
      {/* ヘッダ＝つかみ手（grab）。pointer をここだけで捕捉し移動を起こす。中身は触らない＝地図へ通す。 */}
      <header
        style={HEADER_STYLE}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span style={TITLE_STYLE}>条件で絞り込む</span>
        {/* 掴み代の合図（Lucide・DESIGN §6 SVG）。視覚のみ＝aria 不要だが当たり判定はヘッダ全体。 */}
        <GripHorizontal size={16} aria-hidden="true" style={GRIP_STYLE} />
        {/* 閉じる＝地図全面へ戻す（左端ドロワーの「閉」）。Lucide X・aria-label 必須。 */}
        <IconButton icon={X} label="絞り込みを閉じる" onClick={close} />
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
 * FilterDrawerToggle は左端の開閉ハンドル（閉じている時の入口・ADR-0029）。
 *
 * 左上に小さく置き、押すとドロワーが左端からスライドして出る（開状態は FilterPanel が描く）。
 * 開いている間も押せば閉じる（トグル）＝同じ場所で出し入れできる。Lucide アイコン・aria-label 必須。
 * 値域が無い（絞り込み UI を出せない）間はトグルも出さない判断は呼び側（App）が rangesByMetric で行う。
 */
export function FilterDrawerToggle() {
  const isOpen = useFilterDrawerStore((s) => s.isOpen);
  const toggle = useFilterDrawerStore((s) => s.toggle);
  return (
    <div style={TOGGLE_WRAP_STYLE}>
      <IconButton
        icon={SlidersHorizontal}
        label={isOpen ? "絞り込みを閉じる" : "絞り込みを開く"}
        aria-pressed={isOpen}
        onClick={toggle}
        style={TOGGLE_BUTTON_STYLE}
      />
    </div>
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

// section＝位置取り（左端ドロワー＋浮かせ量）＋開閉スライド。surface 面の見た目もここで持つ（小窓）。
// 既定は左端格納（left=PANEL_MARGIN, top=PANEL_MARGIN）。offset で浮かせ、isVisible で左からの入り/出を切替。
// 出（未表示）＝左へ逃がし透明に／入り＝offset の定位置・不透明。遷移はトークン（--motion-base/-ease）。
// prefers-reduced-motion 時は global.css が transition を実質0にし即時化する。
function panelStyle(isVisible: boolean, offset: DrawerOffset | null): CSSProperties {
  const dx = offset?.dx ?? 0;
  const dy = offset?.dy ?? 0;
  // 入り＝定位置（浮かせ量ぶん移動）／出＝左へ逃がす（パネル幅ぶん左へ退避＝左端からのスライド）。
  const visibleX = `${dx}px`;
  const hiddenX = `calc(${dx}px - ${PANEL_WIDTH + PANEL_MARGIN}px)`;
  return {
    position: "absolute",
    left: PANEL_MARGIN,
    top: PANEL_MARGIN,
    width: PANEL_WIDTH,
    maxWidth: "calc(100vw - 16px)",
    maxHeight: "calc(100vh - 16px)",
    overflowY: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    color: "var(--color-text)",
    // 影は控えめ（prohibited.md shadow-lg 禁止・浮く小窓は弱く）。
    boxShadow: "2px 0 8px rgba(15,23,42,0.08)",
    zIndex: 2, // ズーム/トグル(1) より上（前面の可動小窓）。
    transform: `translate(${isVisible ? visibleX : hiddenX}, ${dy}px)`,
    opacity: isVisible ? 1 : 0,
    transition:
      "transform var(--motion-base) var(--motion-ease), opacity var(--motion-base) var(--motion-ease)",
    willChange: "transform, opacity",
  };
}

// ヘッダ＝つかみ手。grab カーソルで掴めることを示す（touchAction:none で touch のスクロール/ジェスチャを抑え
// pointer ドラッグを安定させる）。掴むのはここだけ＝中身は地図へ通す（ADR-0029）。
const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "var(--color-text-strong)",
  cursor: "grab",
  touchAction: "none",
  userSelect: "none",
};

const GRIP_STYLE: CSSProperties = {
  marginLeft: "auto",
  color: "var(--color-text-faint)", // 掴み代の合図は薄く（操作色はコーラルの点に取っておく・§1）。
};

const TITLE_STYLE: CSSProperties = {
  font: "var(--text-heading)",
};

// 閉じている時の開閉ハンドル＝左上（トグル/ズームと衝突しない位置取りは App の配置で担保）。
const TOGGLE_WRAP_STYLE: CSSProperties = {
  position: "absolute",
  left: 8,
  top: 8,
  zIndex: 1,
};

const TOGGLE_BUTTON_STYLE: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  width: 32,
  height: 32,
  boxShadow: "0 1px 4px rgba(15,23,42,0.08)",
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
