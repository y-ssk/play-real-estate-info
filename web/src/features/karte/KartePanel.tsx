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
 * 状態の真実は Zustand（ADR-0018）。データを詰めるため本文は body-sm 相当（15px・DESIGN §3）。
 *
 * 色について：差し色（コーラル・DESIGN §1）は hex 未確定ゆえ使わず、確定済みのスレート系（黒子）だけで
 * 構成する（MetricToggle と同方針・melta-ui コンポーネント層の取り込み後に差し色へ昇格＝docs/99 トリガー）。
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
    <aside
      // 右側の固定パネル（PC・DESIGN §2 開いた状態）。地図の上に重ねる（兄弟オーバーレイ＝App が合成）。
      style={PANEL_STYLE}
      aria-label="エリアカルテ"
    >
      <header style={HEADER_STYLE}>
        {/* 名称は表示用（結合はコード・ADR-0014）。取得前は選択中コードを仮表示し空白を避ける。 */}
        <h2 style={TITLE_STYLE}>{data?.name ?? selected.unitId}</h2>
        <button type="button" onClick={clear} style={CLOSE_STYLE} aria-label="カルテを閉じる">
          閉じる
        </button>
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

// --- スタイル（生値直書きは MetricToggle と同方針＝melta-ui コンポーネント層の取り込み前。色はスレート系・
//     密度は body-sm 相当＝DESIGN §1/§3。コンポーネント層取り込み後にトークン参照へ寄せる・docs/99）。 ---

const PANEL_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  width: 360,
  maxWidth: "90vw",
  padding: 16,
  background: "#ffffff",
  borderLeft: "1px solid #e2e8f0", // slate-200（黒子の境）。全周ボーダーは付けない（DESIGN no-decoration）。
  boxShadow: "-2px 0 8px rgba(15,23,42,0.08)",
  overflowY: "auto",
  zIndex: 2, // ズーム表示(1)・トグル(1)より上（パネルは前面の収束面）。
  color: "#334155", // slate-700（本文色）。
  font: "15px/1.5 system-ui, sans-serif", // body-sm 相当（データを詰める場所・DESIGN §3）。
};

const HEADER_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 12,
};

const TITLE_STYLE: React.CSSProperties = {
  margin: 0,
  font: "600 18px/1.4 system-ui, sans-serif", // 名称は見出し（読ませる・DESIGN §3）。
  color: "#1e293b", // slate-800。
};

const CLOSE_STYLE: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 3,
  border: "1px solid #cbd5e1", // slate-300。差し色は使わない（hex 未確定・上 doc 参照）。
  background: "transparent",
  color: "#334155",
  font: "12px/1.4 system-ui, sans-serif",
  cursor: "pointer",
  flexShrink: 0,
};

const NOTE_STYLE: React.CSSProperties = { margin: "8px 0", color: "#64748b" }; // slate-500（補助文）。

const LIST_STYLE: React.CSSProperties = { listStyle: "none", margin: 0, padding: 0 };

const ROW_STYLE: React.CSSProperties = {
  padding: "10px 0",
  borderBottom: "1px solid #f1f5f9", // slate-100（行区切り・薄く）。
};

const ROW_HEAD_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 8,
};

const LABEL_STYLE: React.CSSProperties = { color: "#475569" }; // slate-600。

const VALUE_STYLE: React.CSSProperties = {
  fontWeight: 600,
  color: "#1e293b",
  textAlign: "right",
};

const MISSING_STYLE: React.CSSProperties = {
  fontWeight: 400,
  color: "#94a3b8", // slate-400（薄く＝値ではない・「ゼロ」と区別）。
};

const SOURCE_STYLE: React.CSSProperties = {
  margin: "4px 0 0",
  font: "12px/1.4 system-ui, sans-serif", // caption 相当（出典は小さく・DESIGN §3）。
  color: "#64748b",
};
