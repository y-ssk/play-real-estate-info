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
 * 「絞り込み」トグルボタンの上端（px・ADR-0029/0031）。左上原点だと倍率表示（top8）・指標トグル
 * （top40・高さ約32）を覆うため、その下＝指標トグル(top40+高さ)の下に置く（{@link TOGGLE_WRAP_STYLE}）。
 * ADR-0031：ボタンは開いても隠さず（active 表示で残す）、パネルはこのボタンの直下（{@link PANEL_OPEN_TOP}）へ出す。
 */
const PANEL_TOP = 84;
/** トグルボタンの高さ概算（px・padding 6*2 + caption 字 ≒ 32）。パネルをボタン直下へ落とす計算に使う（ADR-0031）。 */
const TOGGLE_HEIGHT = 32;
/** ボタンとパネルの縦の隙間（px・詰めすぎず一体に見える程度・ADR-0031）。 */
const TOGGLE_GAP = 6;
/**
 * 開いたパネルの上端（px・ADR-0031）。トグルボタンの下端の直下＝ボタン top＋高さ＋gap。
 * ボタンは開いても残る（隠さない）ので、パネルはそれを避けてボタンの下から伸びる（ヘッダの×がボタンに近接）。
 * 概算定数（厳密なピクセルは層4オーナー実ブラウザ目視で詰める・ADR-0031「概算でよい」）。
 */
const PANEL_OPEN_TOP = PANEL_TOP + TOGGLE_HEIGHT + TOGGLE_GAP;
/**
 * 開閉トグルボタンの安定 id（非モーダル a11y のフォーカス復帰先・ADR-0029 規約例外）。
 * パネル（閉じる側）と FilterDrawerToggle（復帰先）が別コンポーネントなので、DOM の id で起点へ返す
 * （フォーカストラップは入れない＝非モーダル設計と矛盾するため・代わりに ESC で閉じ起点へフォーカスを戻す）。
 */
const TOGGLE_BUTTON_ID = "filter-drawer-toggle";

/**
 * FilterPanel は指標ごとの範囲スライダーで絞り込み条件を入力する**左端ドロワー**（④・ADR-0028/0029/0031）。
 *
 * **開閉ドロワー（ADR-0031＝ADR-0029 を一部更新・DESIGN §2）**：左の操作列のボタン（{@link FilterDrawerToggle}・
 * 指標トグルの下）で開く。閉＝そのボタンだけ見え地図全面、開＝**ボタンは残り（active 表示）その直下（{@link
 * PANEL_OPEN_TOP}）に**左からスライドして出る**左オーバーレイ**のパネル（{@link useMountTransition} で出のアニメも
 * 見せる＝KartePanel の右スライドと対称の左スライド・`--motion-base`・`prefers-reduced-motion` 尊重）。**開いても
 * トグルボタンは隠さない**＝ヘッダの×がボタンに近接し閉じる動線が短い（ADR-0031＝×が遠い層4要望・ADR-0029 の
 * 「開いたら隠す」を更新）。**PC では移動しない（固定）**＝当初の可動（ヘッダ掴み/本体ドラッグ）も別浮きの丸アイコンも
 * 層4で破綻し撤回。**閉じる手段はボタン再クリック・X・ESC**（本体・スライダーを触っても閉じない）。閉じたら起点の
 * トグルへフォーカス復帰。カルテは右端固定ゆえ左に置き取り合わない（左=探索のドロワー／右=収束の固定・ADR-0029）。
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
      {/* ヘッダはタイトル＋閉じる(X)のみ。掴み手・飾りアイコンは撤回（移動なし・ADR-0029）。
          パネルはトグルボタンの直下に出る（ボタンは開いても残る・ADR-0031）＝ヘッダの×とボタンが縦に近接。 */}
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
 * FilterDrawerToggle は開閉を起こす**左の操作列のラベル付きボタン1つ**（開閉トグル・ADR-0031）。
 *
 * 指標トグル（`MetricToggle` top40）の下に置き、倍率表示（top8）・指標トグルと衝突しない位置にする
 * （左上の角の取り合いを避ける・別レイヤーで浮かせる丸アイコンは廃止＝モーダルと重なる違和感の元）。
 * **開いてもこのボタンは隠さない**（ADR-0031＝ADR-0029 の「開いたら隠す」を更新）：開いている間は `aria-expanded`
 * を true にし active 表示（差し色コーラルは使わず＝ADR-0029/DESIGN §1 の「点」使いを崩さない・不透明な白面＋強い枠＋
 * 太字で押下状態を示す）。パネルは本ボタンの直下（{@link PANEL_OPEN_TOP}）に出る。閉は `SlidersHorizontal`＋
 * 「絞り込み」テキスト。**`onClick` は toggle**＝再クリックで閉じる（開く/閉じるが同一ボタン・×/ESC と並ぶ閉じ手段）。
 * フォーカス復帰先として安定 id（{@link TOGGLE_BUTTON_ID}）を持つ。値域が無い間は呼び側（App）が出さない。
 */
export function FilterDrawerToggle() {
  const isOpen = useFilterDrawerStore((s) => s.isOpen);
  const toggle = useFilterDrawerStore((s) => s.toggle);
  return (
    <div style={TOGGLE_WRAP_STYLE}>
      <button
        id={TOGGLE_BUTTON_ID}
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        // 開いている間は active 表示（押されている合図）。色だけで状態を伝えず fontWeight も併用（prohibited.md）。
        style={isOpen ? TOGGLE_BUTTON_ACTIVE_STYLE : TOGGLE_BUTTON_STYLE}
      >
        {/* アイコンは Lucide（絵文字不使用・DESIGN §6）。テキスト併記でアイコン単独の曖昧さを避ける。 */}
        <SlidersHorizontal size={16} aria-hidden="true" />
        絞り込み
      </button>
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
// 定位置は左端（left=PANEL_MARGIN, top=PANEL_OPEN_TOP）。上端はトグルボタンの下端の直下＝開いてもボタンは残る
// （ADR-0031）ので、そのぶん下げてボタンを避ける（倍率/指標トグルも覆わない・スライス4c）。
// PC は移動しない＝offset は持たない（ADR-0029 改訂）。
// 出（未表示）＝左へ逃がし透明に／入り＝定位置・不透明。遷移はトークン（--motion-base/-ease）。
// prefers-reduced-motion 時は global.css が transition を実質0にし即時化する。
function panelStyle(isVisible: boolean): CSSProperties {
  // 入り＝定位置（0）／出＝左へ逃がす（パネル幅＋余白ぶん左へ退避＝左端からのスライド）。
  const hiddenX = `calc(-1 * (${PANEL_WIDTH}px + ${PANEL_MARGIN}px))`;
  return {
    position: "absolute",
    left: PANEL_MARGIN,
    top: PANEL_OPEN_TOP,
    width: PANEL_WIDTH,
    maxWidth: "calc(100vw - 16px)",
    // 上端を PANEL_OPEN_TOP まで下げたぶん高さも詰める＝画面下にはみ出さない（PANEL_OPEN_TOP + 下余白8）。
    maxHeight: `calc(100vh - ${PANEL_OPEN_TOP + PANEL_MARGIN}px)`,
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
    // 左オーバーレイ＝倍率(1)・指標トグル(1)・トグルボタン(1) より上。ボタン直下に出るので通常は重ならないが
    // スライド途中の前後関係を安定させるため上に置く（ADR-0031）。
    zIndex: 2,
    transform: `translateX(${isVisible ? "0" : hiddenX})`,
    opacity: isVisible ? 1 : 0,
    transition:
      "transform var(--motion-base) var(--motion-ease), opacity var(--motion-base) var(--motion-ease)",
    willChange: "transform, opacity",
  };
}

// ヘッダ＝タイトル＋閉じる(X)。掴み手・移動は撤回（ADR-0029）。開くとトグルは隠れる＝重ならないので逃げ余白は不要。
const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  color: "var(--color-text-strong)",
};

const TITLE_STYLE: CSSProperties = {
  font: "var(--text-heading)",
};

// トグル＝左の操作列のボタン。指標トグル（top40・高さ約32）の下（top=PANEL_TOP）に置き衝突を避ける
// （倍率 top8・指標 top40）。開いてもここに残る（ADR-0031）＝パネル（panelStyle）はこのボタンの直下
// （PANEL_OPEN_TOP）に出る。MetricToggle と同じ左端 left8 で操作列を縦に揃える。
const TOGGLE_WRAP_STYLE: CSSProperties = {
  position: "absolute",
  left: 8,
  top: PANEL_TOP,
  zIndex: 1,
};

// 指標トグル（MetricToggle）と同じ操作列の見た目に揃える＝薄い白面・スレート枠・キャプション字。
// アイコン＋テキストを横並び（差し色は使わない＝操作の「点」はつまみ/リセットに取っておく・§1）。
const TOGGLE_BUTTON_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-md)",
  background: "rgba(255,255,255,0.9)",
  color: "var(--color-text)",
  font: "var(--text-caption)",
  // fontWeight を明示（active で 600 へ変えるため。base/active で同じ longhand キーを持たせ、shorthand `font` との
  // 混在で React が「プロパティ削除」警告を出すのを避ける＝同一 button 要素で style を差し替えるため）。
  fontWeight: 400,
  cursor: "pointer",
  // フォーカスリング＝brand コーラル（prohibited.md「outline:none without ring」回避・MetricToggle と同方針）。
  outlineColor: "var(--color-accent-emphasis)",
  outlineOffset: 1,
};

// 開いている間の active 表示（ADR-0031）。差し色コーラルは使わない（＝ADR-0029/DESIGN §1 の「点」使いはつまみ/
// リセットに取っておく）。押下状態は不透明な白面＋強い枠＋太字で示す（色だけに頼らず fontWeight 併用・prohibited.md）。
// base と同じキー（border/fontWeight は shorthand と衝突しない longhand）だけを上書きし、値だけ変える
// （プロパティの出し入れをしない＝同一要素での style 差し替え時の React 警告を避ける）。
const TOGGLE_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...TOGGLE_BUTTON_STYLE,
  background: "var(--color-surface)",
  border: "1px solid var(--color-text-label)",
  color: "var(--color-text-strong)",
  fontWeight: 600,
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
