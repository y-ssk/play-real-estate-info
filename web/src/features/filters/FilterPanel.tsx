import { SlidersHorizontal, X } from "lucide-react";
import { type CSSProperties, useEffect, useRef } from "react";
import { Button } from "../../components/Button";
import { IconButton } from "../../components/IconButton";
import { RangeSlider } from "../../components/RangeSlider";
import { useFilterDrawerStore } from "../../lib/filterDrawerStore";
import { useFilterStore } from "../../lib/filterStore";
import type { MetricCondition } from "../../lib/filtering";
import { useMountTransition } from "../../lib/useMountTransition";
import { METRICS, METRIC_ORDER } from "../choropleth/metrics";
import type { MetricRange } from "./useFilterMatch";

/** ドロワー開閉アニメの所要（--motion-base=200ms と揃える＝出のアンマウント待ち・KartePanel と対称）。 */
const PANEL_MOTION_MS = 200;
/** パネル幅と左上余白（左端ドロワーの定位置＝この位置から開閉スライドする。PC は移動しない＝固定・ADR-0029）。 */
const PANEL_WIDTH = 280;
const PANEL_MARGIN = 8;
/**
 * 開閉トグルボタンの安定 id（非モーダル a11y のフォーカス復帰先・ADR-0029 規約例外）。
 * パネル（閉じる側）と FilterDrawerToggle（復帰先）が別コンポーネントなので、DOM の id で起点へ返す
 * （フォーカストラップは入れない＝非モーダル設計と矛盾するため・代わりに ESC で閉じ起点へフォーカスを戻す）。
 */
const TOGGLE_BUTTON_ID = "filter-drawer-toggle";

/**
 * FilterPanel は指標ごとの範囲スライダーで絞り込み条件を入力する**左端ドロワー**（④・ADR-0028/0029）。
 *
 * **開閉ドロワー（ADR-0029・DESIGN §2）**：左上の丸アイコン1つ（{@link FilterDrawerToggle}）で開閉する。
 * 閉＝丸アイコンだけ見え地図全面、開＝左からスライドして出たパネル（{@link useMountTransition} で出の
 * アニメも見せる＝KartePanel の右スライドと対称の左スライド・`--motion-base`・`prefers-reduced-motion` 尊重）。
 * **PC では移動しない（固定）**＝当初の可動（ヘッダ掴み/本体ドラッグ）は層4で破綻し撤回（ADR-0029 改訂）。
 * **閉じられるのは2つだけ＝左上の丸アイコンと閉じる(X)**。本体・スライダーを触っても閉じない。
 * カルテは右端固定ゆえ左に置き取り合わない（左=探索のドロワー／右=収束の固定・ADR-0029）。
 *
 * **一覧表は持たない**（dead-end 根絶・ADR-0028）：条件を立てると地図が該当区を強調し（別チャネル・
 * ChoroplethLayer）、該当区クリックで既存カルテ（③）が開く＝「広く探す→ピン→比較」の探す段に徹する。
 * 並べ替え（F7）はここに出さない（#6 ピン一覧へ移設・ADR-0028）。条件は AND・重みづけしない（ADR-0012）。
 *
 * 値は `filterStore`（条件＝Zustand）、開閉は `filterDrawerStore`（器の開閉＝Zustand・ADR-0018）に分けて
 * 持つ（状態の真実は store・地図ハイライトは描画の鏡・§3）。各指標は値域 [min,max] を両端に持つ範囲スライダー
 * （共通部品 {@link RangeSlider}）で下限/上限を指定。値域いっぱいの条件は外す＝空条件を溜めない。
 *
 * 見た目：surface のパネル。アイコンは Lucide（絵文字不使用・DESIGN §6）。差し色コーラルはつまみとリセットの
 * 主操作だけ（点使い・§1）。生値は書かず意味/用途トークンを参照（ADR-0027/DESIGN §4）。
 *
 * @param rangesByMetric 指標キー→値域（スライダー両端）。値の無い指標はスライダーを出さない。
 */
export function FilterPanel({ rangesByMetric }: { rangesByMetric: Record<string, MetricRange> }) {
  const conditions = useFilterStore((s) => s.conditions);
  const setCondition = useFilterStore((s) => s.setCondition);
  const clearConditions = useFilterStore((s) => s.clearConditions);

  const isOpen = useFilterDrawerStore((s) => s.isOpen);
  const close = useFilterDrawerStore((s) => s.close);

  // 開閉アニメの時間管理（クローズ後も PANEL_MOTION_MS は描画を残し出のスライドを見せる・KartePanel と同型）。
  const { shouldRender, isVisible } = useMountTransition(isOpen, PANEL_MOTION_MS);

  // 非モーダル a11y（ADR-0029 規約例外）：開いている間 ESC で閉じる。フォーカストラップは入れない
  // （背面の地図を操作させる非モーダル設計と矛盾するため）＝tab は内部に閉じ込めない。
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, close]);

  // フォーカス復帰：閉じた瞬間（開→閉の立ち下がり）にフォーカスを起点のトグルへ戻す（開いた場所へ返す）。
  // パネルと別コンポーネントの復帰先は id で引く（DOM 直引き＝store にフォーカス責務を持たせない）。
  const wasOpenRef = useRef(isOpen);
  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      document.getElementById(TOGGLE_BUTTON_ID)?.focus();
    }
    wasOpenRef.current = isOpen;
  }, [isOpen]);

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

  return (
    // 左端ドロワー（固定位置）。isVisible で左からの入り/出スライドを切替（移動はしない・ADR-0029）。
    <section style={panelStyle(isVisible)} aria-label="絞り込み">
      {/* ヘッダはタイトル＋閉じる(X)のみ。掴み手・飾りアイコンは撤回（移動なし・ADR-0029 改訂）。
          タイトルは左上の丸トグル（重ねて配置）と重ならないよう左に余白を取る（HEADER_STYLE）。 */}
      <header style={HEADER_STYLE}>
        <span style={TITLE_STYLE}>条件で絞り込む</span>
        {/* 閉じる＝地図全面へ戻す。Lucide X・aria-label 必須（閉じられる2つのうちの片方）。 */}
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
 * FilterDrawerToggle は開閉を担う**唯一のトグル**＝左上の角の丸いアイコン（ADR-0029）。
 *
 * 閉じている時はこの丸アイコンだけが見え（押すと開く）、開いている時はパネルの左上角に留まり押すと閉じる
 * （＝同じ1つのトグルが開閉両用）。開いている間もパネルに覆われず押せるよう **z-index をパネルより上**に置く
 * （`TOGGLE_WRAP_STYLE`）。形は**丸**（角丸 9999）でモーダル左上の角を示す。aria-pressed/label を開閉で出し分け。
 * 値域が無い（絞り込み UI を出せない）間はトグルも出さない判断は呼び側（App）が rangesByMetric で行う。
 */
export function FilterDrawerToggle() {
  const isOpen = useFilterDrawerStore((s) => s.isOpen);
  const toggle = useFilterDrawerStore((s) => s.toggle);
  return (
    <div style={TOGGLE_WRAP_STYLE}>
      <IconButton
        id={TOGGLE_BUTTON_ID}
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

// section＝位置取り（左端ドロワー・固定）＋開閉スライド。surface 面の見た目もここで持つ（小窓）。
// 定位置は左端（left=PANEL_MARGIN, top=PANEL_MARGIN）。PC は移動しない＝offset は持たない（ADR-0029 改訂）。
// 出（未表示）＝左へ逃がし透明に／入り＝定位置・不透明。遷移はトークン（--motion-base/-ease）。
// prefers-reduced-motion 時は global.css が transition を実質0にし即時化する。
function panelStyle(isVisible: boolean): CSSProperties {
  // 入り＝定位置（0）／出＝左へ逃がす（パネル幅＋余白ぶん左へ退避＝左端からのスライド）。
  const hiddenX = `calc(-1 * (${PANEL_WIDTH}px + ${PANEL_MARGIN}px))`;
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
    zIndex: 2, // ズーム(1) より上。トグル(3) より下＝開いてもトグルを押せる。
    transform: `translateX(${isVisible ? "0" : hiddenX})`,
    opacity: isVisible ? 1 : 0,
    transition:
      "transform var(--motion-base) var(--motion-ease), opacity var(--motion-base) var(--motion-ease)",
    willChange: "transform, opacity",
  };
}

// ヘッダ＝タイトル＋閉じる(X)。掴み手・移動は撤回（ADR-0029 改訂）。タイトルは左上の丸トグルと重ならないよう
// 左に余白（paddingLeft）を取る＝トグルはパネルの左上角に重なって留まる（開閉両用）。
const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  paddingLeft: 36, // 左上の丸トグル（28px＋余白）と重ならない逃げ。
  color: "var(--color-text-strong)",
};

const TITLE_STYLE: CSSProperties = {
  font: "var(--text-heading)",
};

// 唯一のトグル＝左上の丸アイコン。パネルの定位置の左上角に重なって留まる（同位置）。
// z-index はパネル(2)より上(3)＝開いている間もパネルに覆われず押せる（閉じられる）。
const TOGGLE_WRAP_STYLE: CSSProperties = {
  position: "absolute",
  left: PANEL_MARGIN,
  top: PANEL_MARGIN,
  zIndex: 3,
};

const TOGGLE_BUTTON_STYLE: CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 9999, // 丸（角の丸いアイコン・ADR-0029）。
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
