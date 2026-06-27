import { X } from "lucide-react";
import type { CSSProperties } from "react";
import { IconButton } from "../../components/IconButton";
import { Panel } from "../../components/Panel";
import type { Karte, KarteMetric } from "../../lib/karte";
import { useSelectionStore } from "../../lib/selection";
import { METRICS } from "../choropleth/metrics";
import { useKarte } from "./useKarte";

/**
 * KartePanel は選択した単位の詳細（カルテ）を③開閉式パネルで表示する（DESIGN §2・ADR-0011）。
 *
 * **③開閉式**：未選択（selectedUnit=null）はパネルを出さず地図が全面（没入・探索フェーズ）。単位を選ぶと
 * 右側に固定領域でカルテを開く（収束フェーズ・DESIGN §2）。クローズで選択を解除し地図全面へ戻す。
 * モバイルのボトムシート（DESIGN §2）は PC 実装後（下の申し送りコメント参照）。
 *
 * 表示（ADR-0011 骨組み）：名称＋各指標の「見出し数値＋単位＋出典」。指標名/単位/整形は
 * features/choropleth/metrics.ts の registry を流用し二重管理しない（frontend-conventions §5）。
 * データなし3区別（present/none/suppressed）を見た目で分け（ADR-0011）、推計指標は「推計」を出典で明示（ADR-0009）。
 * 状態の真実は Zustand（ADR-0018）。データを詰めるため本文は body-sm 相当（text-data・DESIGN §3）。
 *
 * 構成：surface 面の器は共通部品 {@link Panel}（melta card.md）を aside で包む（complementary ロールを保つ）。
 * 閉じるは Lucide の X アイコンボタン（{@link IconButton}・DESIGN §6 SVG／絵文字不使用）。色は黒子のスレート
 * 中心で、差し色（コーラル）はカルテ本体では点使いの対象が無いため出さない（操作色はトグル/フォーカス・DESIGN §1）。
 * 生値（hex）は書かず意味/用途トークンを参照する（ADR-0027/DESIGN §4）。
 *
 * 申し送り（モバイル）：本パネルは PC の右側固定パネル。モバイルでは DESIGN §2 のボトムシート
 * （下から引き上げ）へ退避させる＝同じ「開閉＝状態」のメンタルモデルを保つ。レイアウト分岐は PC 実装後に足す。
 */
export function KartePanel() {
  const selected = useSelectionStore((s) => s.selectedUnit);
  const clear = useSelectionStore((s) => s.clear);
  const { data, isLoading, isError } = useKarte(selected);

  // 未選択はパネルを出さない＝地図全面（③開閉式の「閉」・DESIGN §2）。
  if (!selected) {
    return null;
  }

  return (
    // 右側の固定パネル（PC・DESIGN §2 開いた状態）。地図の上に重ねる（兄弟オーバーレイ＝App が合成）。
    // surface 面の器は共通部品 Panel。aside で包み complementary ロールと位置取り（固定/スクロール）を担う。
    <aside style={ASIDE_STYLE} aria-label="エリアカルテ">
      <Panel style={INNER_STYLE}>
        <header style={HEADER_STYLE}>
          {/* 名称は表示用（結合はコード・ADR-0014）。取得前に生の5桁コード（内部識別子）を見せると
              区を選び直すたび数字がチラつく＝代わりにスケルトン（細いバー）を出す（ローディングの正しさ）。
              data 到着後に name が空/欠損のエッジは生コードに落とさず中立文言にする（生コードは絶対に出さない）。 */}
          {data ? (
            <h2 style={TITLE_STYLE}>{data.name || "（名称不明）"}</h2>
          ) : (
            <div style={TITLE_SKELETON_STYLE} aria-label="名称を読み込み中" />
          )}
          {/* 閉じる＝Lucide X（DESIGN §6 SVG・aria-label 必須）。読込中でも常に出す（閉じられる）。
              選択を解除し地図全面へ戻す（③開閉式）。 */}
          <IconButton icon={X} label="カルテを閉じる" onClick={clear} />
        </header>

        {isLoading && <p style={NOTE_STYLE}>読み込み中…</p>}
        {isError && <p style={NOTE_STYLE}>カルテの取得に失敗しました。</p>}

        {data && (
          <div>
            {data.metrics.length === 0 ? (
              // 指標がまだ無い単位（島嶼等）。単位は実在するが素性は未整備＝黙って空にしない（ADR-0011）。
              <p style={NOTE_STYLE}>この単位の指標はまだありません。</p>
            ) : (
              <ul style={LIST_STYLE}>
                {data.metrics.map((m) => (
                  <MetricRow key={m.metric} metric={m} />
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>
    </aside>
  );
}

/**
 * MetricRow はカルテの1指標（見出し数値＋単位＋出典）を描く（ADR-0011 各分野2段の見出し側）。
 *
 * データなし3区別を見た目で分ける（ADR-0011）：present は整形済みの値、none は「データなし（未整備）」、
 * suppressed は「秘匿」。出典は registry を権威に表示（推計は文言に「推計」を含む＝ADR-0009 断定しない）。
 */
function MetricRow({ metric }: { metric: KarteMetric }) {
  const def = METRICS[metric.metric];
  // registry に無い指標（カルテ専用指標が先に来る場合）はキーを表示名にフォールバックする。
  const title = def?.title ?? metric.metric;
  // 出典は registry を権威に（表示の二重管理を避ける）。registry に無ければ API の source を使う。
  const source = def?.source ?? metric.source;

  return (
    <li style={ROW_STYLE}>
      <div style={ROW_HEAD_STYLE}>
        <span style={LABEL_STYLE}>{title}</span>
        <span style={VALUE_STYLE}>
          <MetricValueText metric={metric} />
        </span>
      </div>
      {/* 出典は法的要件ゆえ各指標に必ず出す（ADR-0011 (c)・frontend-conventions §5）。 */}
      <p style={SOURCE_STYLE}>{source}</p>
    </li>
  );
}

/**
 * MetricValueText は指標値を3区別で出し分ける（ADR-0011）。
 * present＝整形済みの値＋単位（registry の format・該当なし＝0 もここ）／none＝データなし／suppressed＝秘匿。
 */
function MetricValueText({ metric }: { metric: KarteMetric }) {
  if (metric.status === "none") {
    // 「危険ゼロ」と混同させない＝0 でなく明示的に「データなし」（ADR-0011）。
    return <span style={MISSING_STYLE}>データなし（未整備）</span>;
  }
  if (metric.status === "suppressed") {
    // 小人口メッシュ等で非公開（ADR-0011・ADR-0009 秘匿）。
    return <span style={MISSING_STYLE}>秘匿（非公開）</span>;
  }
  // present：値は確定（0 も含む）。registry の format で単位・桁・%・符号を整える（二重管理しない）。
  const def = METRICS[metric.metric];
  const value = metric.value ?? 0; // present なら value は非 null（型上 null 可ゆえ既定 0 で守る）。
  const text = def ? def.format(value) : String(value);
  const unit = def?.unit ?? "";
  return (
    <>
      {text}
      {unit ? ` ${unit}` : ""}
    </>
  );
}

// --- スタイル（意味/用途トークン参照・ADR-0027/DESIGN §4。生値は書かない）。 ---

// aside＝位置取り（右側固定・スクロール・重なり順）。surface の見た目は Panel が担う（INNER_STYLE で上書き）。
const ASIDE_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  width: 360,
  maxWidth: "90vw",
  // 影は控えめ（prohibited.md shadow-lg 禁止・オーバーレイは弱く）。
  boxShadow: "-2px 0 8px rgba(15,23,42,0.08)",
  overflowY: "auto",
  zIndex: 2, // ズーム表示(1)・トグル(1)より上（パネルは前面の収束面）。
};

// Panel 既定の border/radius を、地図右端に貼り付く全画面高さのパネル用に左境界線だけへ寄せる
// （全周ボーダー/角丸は地図端では不要・prohibited.md no-decoration）。本文は text-data（詰める・DESIGN §3）。
const INNER_STYLE: CSSProperties = {
  minHeight: "100%",
  padding: 16,
  border: "none",
  borderLeft: "1px solid var(--color-border)",
  borderRadius: 0,
  color: "var(--color-text)",
  font: "var(--text-data)",
};

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 12,
};

const TITLE_STYLE: CSSProperties = {
  margin: 0,
  font: "var(--text-heading)", // 名称は見出し（読ませる・DESIGN §3）。
  color: "var(--color-text-strong)",
};

// 名称取得前のプレースホルダ（細いバー）。見出し1行ぶんの高さを占め、生コードを出さずに空白も避ける。
// divider トークン（薄い面）で控えめに（スケルトンは bg-slate-200 相当・prohibited.md スケルトン）。
const TITLE_SKELETON_STYLE: CSSProperties = {
  width: "55%",
  height: 18,
  borderRadius: "var(--radius-sm)",
  background: "var(--color-divider)",
};

const NOTE_STYLE: CSSProperties = { margin: "8px 0", color: "var(--color-text-muted)" };

const LIST_STYLE: CSSProperties = { listStyle: "none", margin: 0, padding: 0 };

const ROW_STYLE: CSSProperties = {
  padding: "10px 0",
  borderBottom: "1px solid var(--color-divider)", // 行区切り（薄く）。
};

const ROW_HEAD_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
};

const LABEL_STYLE: CSSProperties = { color: "var(--color-text-label)" };

const VALUE_STYLE: CSSProperties = {
  fontWeight: 600,
  color: "var(--color-text-strong)",
  textAlign: "right",
};

const MISSING_STYLE: CSSProperties = {
  fontWeight: 400,
  color: "var(--color-text-faint)", // 薄く＝値ではない・「ゼロ」と区別。
};

const SOURCE_STYLE: CSSProperties = {
  margin: "4px 0 0",
  font: "var(--text-caption)", // 出典は小さく（DESIGN §3）。
  color: "var(--color-text-muted)",
};
