import { useMemo } from "react";
import { isDefaultSort, nextSortOnHeaderClick, useFilterStore } from "../../lib/filterStore";
import { type SortSpec, type UnitRow, filterUnitRows, sortUnitRows } from "../../lib/filtering";
import { METRICS, METRIC_ORDER } from "../choropleth/metrics";

/**
 * FilterPanel は絞り込み条件の入力と並べ替え一覧表を③開閉式パネルで束ねる（ADR-0012・DESIGN §2）。
 *
 * **③開閉式（DESIGN §2）**：閉じている間は地図が全面（探索）。`open` の時だけ左側に固定領域で開く
 * （収束＝条件で絞り条件に合う街を一覧で読む）。カルテパネル（右側・KartePanel）と**左右で住み分け**、
 * 同時に開いても重ならない（過剰 UI にしない・タスク 5）。
 *
 * 状態の真実は filter store（Zustand・ADR-0018）。本コンポーネントは入力→store 更新と、
 * store＋単位行から「絞り込み→並べ替え」した結果を描くだけ（純ロジックは lib/filtering＝テスト済み）。
 * データを詰める場所ゆえ body-sm 相当・左右整列（DESIGN §3）。色はスレート系のみ（差し色 hex 未確定・
 * MetricToggle/KartePanel と同方針）。
 *
 * @param rows 単位行（全件・geometry×全指標を突き合わせた素材・App が組む）。取得前は空。
 * @param open パネルを開くか（③開閉式の開閉状態・App が持つ）。
 * @param onClose パネルを閉じる（地図全面へ戻す）。
 */
export function FilterPanel({
  rows,
  open,
  onClose,
}: {
  rows: ReadonlyArray<UnitRow>;
  open: boolean;
  onClose: () => void;
}) {
  const conditions = useFilterStore((s) => s.conditions);
  const sort = useFilterStore((s) => s.sort);
  const setCondition = useFilterStore((s) => s.setCondition);
  const clearConditions = useFilterStore((s) => s.clearConditions);
  const setSort = useFilterStore((s) => s.setSort);

  // 絞り込み→並べ替え（純関数・lib/filtering）。結果は store/行が変わった時だけ作り直す。
  const visible = useMemo(() => {
    const matched = filterUnitRows(rows, conditions);
    return sortUnitRows(matched, sort);
  }, [rows, conditions, sort]);

  // 閉じている間は出さない＝地図全面（③開閉式の「閉」・DESIGN §2）。
  if (!open) {
    return null;
  }

  const hasConditions = Object.keys(conditions).length > 0;

  return (
    <aside style={PANEL_STYLE} aria-label="絞り込みと一覧">
      <header style={HEADER_STYLE}>
        <h2 style={TITLE_STYLE}>条件で絞り込む</h2>
        <button type="button" onClick={onClose} style={CLOSE_STYLE} aria-label="絞り込みを閉じる">
          閉じる
        </button>
      </header>

      {/* 条件入力：指標ごとに min/max（registry 順＝指標が増えれば自動で行が増える・タスク 1/2）。 */}
      <div style={CONDITIONS_STYLE}>
        {METRIC_ORDER.map((key) => {
          const def = METRICS[key];
          if (!def) {
            return null;
          }
          const cond = conditions[key];
          return (
            <div key={key} style={CONDITION_ROW_STYLE}>
              <span style={CONDITION_LABEL_STYLE}>
                {def.title}
                {def.unit ? `（${def.unit}）` : ""}
              </span>
              <div style={CONDITION_INPUTS_STYLE}>
                <NumberInput
                  ariaLabel={`${def.title} の下限`}
                  value={cond?.min}
                  placeholder="以上"
                  onChange={(min) => setCondition(key, { min, max: cond?.max })}
                />
                <span style={TILDE_STYLE}>〜</span>
                <NumberInput
                  ariaLabel={`${def.title} の上限`}
                  value={cond?.max}
                  placeholder="以下"
                  onChange={(max) => setCondition(key, { min: cond?.min, max })}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div style={ACTIONS_STYLE}>
        <span style={COUNT_STYLE}>
          {hasConditions ? `${visible.length} 件が該当` : `全 ${visible.length} 件`}
        </span>
        {hasConditions && (
          <button type="button" onClick={clearConditions} style={RESET_STYLE}>
            条件をクリア
          </button>
        )}
      </div>

      {/* 並べ替え一覧表（ADR-0012）：行=街・列=名称＋各指標値。列ヘッダ押下で昇順↔降順。 */}
      {visible.length === 0 ? (
        // 0件＝条件に合う街なし（黙って空表にしない・タスク 5）。
        <p style={EMPTY_STYLE}>条件に合う市区町村はありません。条件をゆるめてください。</p>
      ) : (
        <div style={TABLE_WRAP_STYLE}>
          <table style={TABLE_STYLE}>
            <thead>
              <tr>
                <SortableTh
                  label="市区町村"
                  metricKey={null}
                  sort={sort}
                  align="left"
                  onSort={(k) => setSort(nextSortOnHeaderClick(sort, k))}
                />
                {METRIC_ORDER.map((key) => {
                  const def = METRICS[key];
                  if (!def) {
                    return null;
                  }
                  return (
                    <SortableTh
                      key={key}
                      label={def.title}
                      metricKey={key}
                      sort={sort}
                      align="right"
                      onSort={(k) => setSort(nextSortOnHeaderClick(sort, k))}
                    />
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <ResultRow key={row.code} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </aside>
  );
}

/** 一覧の1行（街名＋各指標値）。値は registry の整形を流用（カルテ/凡例と一致・二重管理しない）。 */
function ResultRow({ row }: { row: UnitRow }) {
  return (
    <tr>
      <td style={NAME_CELL_STYLE}>{row.name}</td>
      {METRIC_ORDER.map((key) => {
        const def = METRICS[key];
        if (!def) {
          return null;
        }
        const status = row.statuses[key];
        const value = row.values[key];
        // データなし/秘匿は値ではない＝薄く区別（ADR-0011・並べ替えでは末尾に集まる）。
        if (status !== "present" || value === null || value === undefined) {
          return (
            <td key={key} style={MISSING_CELL_STYLE}>
              {status === "suppressed" ? "秘匿" : "データなし"}
            </td>
          );
        }
        return (
          <td key={key} style={VALUE_CELL_STYLE}>
            {def.format(value)}
            {def.unit ? ` ${def.unit}` : ""}
          </td>
        );
      })}
    </tr>
  );
}

/** 並べ替え可能な列ヘッダ。押下で {@link nextSortOnHeaderClick} の規則に従い向きを切り替える。 */
function SortableTh({
  label,
  metricKey,
  sort,
  align,
  onSort,
}: {
  label: string;
  metricKey: string | null;
  sort: SortSpec;
  align: "left" | "right";
  onSort: (metricKey: string | null) => void;
}) {
  const isActive = sort.metricKey === metricKey && !(metricKey === null && isDefaultSort(sort));
  // 向きの矢印は機種依存文字（絵文字）を避け、ASCII の不等号で示す（DESIGN §6・no-emoji）。
  const indicator = isActive ? (sort.direction === "asc" ? " ^" : " v") : "";
  return (
    <th style={{ ...TH_STYLE, textAlign: align }}>
      <button
        type="button"
        onClick={() => onSort(metricKey)}
        style={{ ...TH_BUTTON_STYLE, textAlign: align }}
        aria-label={`${label} で並べ替え`}
      >
        {label}
        {indicator}
      </button>
    </th>
  );
}

/** 数値入力（空文字＝条件なし＝undefined）。NaN は弾いて undefined にする（不正入力で絞らない）。 */
function NumberInput({
  value,
  placeholder,
  ariaLabel,
  onChange,
}: {
  value: number | undefined;
  placeholder: string;
  ariaLabel: string;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange(undefined);
          return;
        }
        const n = Number(raw);
        onChange(Number.isNaN(n) ? undefined : n);
      }}
      style={INPUT_STYLE}
    />
  );
}

// --- スタイル（生値直書きは MetricToggle/KartePanel と同方針＝melta-ui コンポーネント層の取り込み前。
//     色はスレート系・密度は body-sm 相当＝DESIGN §1/§3。取り込み後にトークン参照へ寄せる・docs/99）。 ---

const PANEL_STYLE: React.CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0, // 左側＝カルテ（右側）と住み分ける（同時に開いても重ならない）。
  bottom: 0,
  width: 420,
  maxWidth: "92vw",
  padding: 16,
  background: "#ffffff",
  borderRight: "1px solid #e2e8f0", // slate-200（黒子の境）。全周ボーダーは付けない（DESIGN no-decoration）。
  boxShadow: "2px 0 8px rgba(15,23,42,0.08)",
  overflowY: "auto",
  zIndex: 2,
  color: "#334155", // slate-700。
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
  font: "600 18px/1.4 system-ui, sans-serif",
  color: "#1e293b",
};

const CLOSE_STYLE: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 3,
  border: "1px solid #cbd5e1",
  background: "transparent",
  color: "#334155",
  font: "12px/1.4 system-ui, sans-serif",
  cursor: "pointer",
  flexShrink: 0,
};

const CONDITIONS_STYLE: React.CSSProperties = { display: "grid", gap: 10, marginBottom: 12 };

const CONDITION_ROW_STYLE: React.CSSProperties = { display: "grid", gap: 4 };

const CONDITION_LABEL_STYLE: React.CSSProperties = { color: "#475569", fontSize: 13 };

const CONDITION_INPUTS_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const TILDE_STYLE: React.CSSProperties = { color: "#94a3b8" };

const INPUT_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "4px 8px",
  borderRadius: 3,
  border: "1px solid #cbd5e1",
  font: "14px/1.4 system-ui, sans-serif",
  color: "#1e293b",
};

const ACTIONS_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  marginBottom: 8,
};

const COUNT_STYLE: React.CSSProperties = { color: "#475569", fontWeight: 600 };

const RESET_STYLE: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 3,
  border: "1px solid #cbd5e1",
  background: "transparent",
  color: "#334155",
  font: "12px/1.4 system-ui, sans-serif",
  cursor: "pointer",
};

const EMPTY_STYLE: React.CSSProperties = { margin: "12px 0", color: "#64748b" };

const TABLE_WRAP_STYLE: React.CSSProperties = { overflowX: "auto" };

const TABLE_STYLE: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

const TH_STYLE: React.CSSProperties = {
  position: "sticky",
  top: 0,
  background: "#f8fafc", // slate-50（見出し帯）。
  borderBottom: "1px solid #e2e8f0",
  padding: 0,
};

const TH_BUTTON_STYLE: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "none",
  background: "transparent",
  color: "#334155",
  font: "600 12px/1.4 system-ui, sans-serif",
  cursor: "pointer",
};

const NAME_CELL_STYLE: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #f1f5f9",
  color: "#1e293b",
  textAlign: "left",
};

const VALUE_CELL_STYLE: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #f1f5f9",
  color: "#334155",
  textAlign: "right", // 数値は右揃え（一覧性・DESIGN §3 左右整列）。
  whiteSpace: "nowrap",
};

const MISSING_CELL_STYLE: React.CSSProperties = {
  padding: "6px 8px",
  borderBottom: "1px solid #f1f5f9",
  color: "#94a3b8", // slate-400（値ではない＝薄く・ADR-0011）。
  textAlign: "right",
  whiteSpace: "nowrap",
};
