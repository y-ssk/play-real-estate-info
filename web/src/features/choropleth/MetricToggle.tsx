import { METRICS, METRIC_ORDER } from "./metrics";

/**
 * MetricToggle は面塗りの指標を切り替える最小トグル（地図左上に重ねる・DESIGN §2 レイヤー切替）。
 *
 * 指標の並びは {@link METRIC_ORDER}・表示名は {@link METRICS} から引く（指標追加はトグル無改修で増える）。
 * 選択は親（App）が持つ UI 状態を `onChange` で更新する（状態の真実は親・frontend-conventions §3）。
 *
 * 色について：選択中の「操作色（コーラル）」は DESIGN §1 で「仮確定」かつ hex 未確定ゆえ、ここでは
 * 確定済みのスレート系（黒子・DESIGN §1 ベース）だけで選択を表す（選択＝濃い背景＋太字）。コーラルの
 * hex 確定・melta-ui コンポーネント層の取り込み後に差し色へ昇格する（docs/99 トリガー登録）。
 *
 * @param metric 選択中の指標キー。
 * @param onChange 指標キーを切り替えるコールバック。
 */
export function MetricToggle({
  metric,
  onChange,
}: {
  metric: string;
  onChange: (metric: string) => void;
}) {
  return (
    <div
      // 地図左上（ズーム表示の下）。操作要素ゆえ pointerEvents は既定（押せる）。
      style={{
        position: "absolute",
        top: 40,
        left: 8,
        display: "flex",
        gap: 4,
        padding: 4,
        borderRadius: 4,
        background: "rgba(255,255,255,0.9)",
        zIndex: 1,
      }}
    >
      {METRIC_ORDER.map((key) => {
        const def = METRICS[key];
        if (!def) {
          return null;
        }
        const active = key === metric;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            // 選択＝濃いスレート背景＋白文字（黒子の中で「いま選んでいる」を濃さで示す）。
            // 非選択＝淡いスレート枠。差し色（コーラル）は hex 未確定ゆえ今は使わない（上の doc 参照）。
            style={{
              padding: "4px 10px",
              borderRadius: 3,
              border: active ? "1px solid #334155" : "1px solid #cbd5e1",
              background: active ? "#334155" : "transparent",
              color: active ? "#ffffff" : "#334155",
              font: "12px/1.4 system-ui, sans-serif",
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
            }}
          >
            {def.title}
          </button>
        );
      })}
    </div>
  );
}
