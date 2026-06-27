import {
  type UnitRow,
  buildUnitRows,
  filterUnitRows,
  isEmptyCondition,
  matchesConditions,
  sortUnitRows,
} from "./filtering";
import type { MetricValue } from "./values";

// 絞り込み・並べ替えの純ロジック検証（本丸＝状態ロジック・frontend-conventions §8）。
// 死守点：条件 AND・データなし除外（ADR-0011）・並べ替え安定＆データなし末尾・空結果（ADR-0012）。

const A: MetricValue = { code: "13101", value: 11.6, status: "present" }; // 千代田区（面積小）
const B: MetricValue = { code: "13102", value: 10.2, status: "present" }; // 中央区
const C: MetricValue = { code: "13103", value: 20.4, status: "present" }; // 港区（面積大）
const D: MetricValue = { code: "13104", value: null, status: "none" }; // データなし
const E: MetricValue = { code: "13105", value: null, status: "suppressed" }; // 秘匿

const POP_A: MetricValue = { code: "13101", value: 0.05, status: "present" }; // +5%
const POP_B: MetricValue = { code: "13102", value: -0.1, status: "present" }; // -10%
const POP_C: MetricValue = { code: "13103", value: 0.0, status: "present" }; // 0%（present・該当なしでない）

const UNITS = [
  { code: "13101", name: "千代田区" },
  { code: "13102", name: "中央区" },
  { code: "13103", name: "港区" },
  { code: "13104", name: "新宿区" },
  { code: "13105", name: "文京区" },
];

describe("buildUnitRows（geometry × 全指標を code で突き合わせ）", () => {
  it("各単位に全指標の値と状態が載る（geometry を母体に組む）", () => {
    const rows = buildUnitRows(UNITS, {
      area_km2: [A, B, C, D, E],
      pop_change_rate_2020_2050: [POP_A, POP_B, POP_C],
    });
    expect(rows).toHaveLength(5);
    const chiyoda = rows.find((r) => r.code === "13101");
    expect(chiyoda?.values.area_km2).toBe(11.6);
    expect(chiyoda?.statuses.area_km2).toBe("present");
    expect(chiyoda?.values.pop_change_rate_2020_2050).toBe(0.05);
  });

  it("geometry にあるが指標応答に無い単位は none で埋める（黙って欠かさない・ADR-0011）", () => {
    const rows = buildUnitRows(UNITS, {
      pop_change_rate_2020_2050: [POP_A], // 13101 のみ
    });
    const shinjuku = rows.find((r) => r.code === "13104");
    expect(shinjuku?.values.pop_change_rate_2020_2050).toBeNull();
    expect(shinjuku?.statuses.pop_change_rate_2020_2050).toBe("none");
  });

  it("指標応答にあるが geometry に無い code は無視する（描けない単位を出さない）", () => {
    const rows = buildUnitRows([{ code: "13101", name: "千代田区" }], {
      area_km2: [A, B, C], // 13102/13103 は geometry に無い
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.code).toBe("13101");
  });

  it("入力（geometry）の順を保つ（表示順の母体）", () => {
    const rows = buildUnitRows(UNITS, { area_km2: [C, A, B] });
    expect(rows.map((r) => r.code)).toEqual(["13101", "13102", "13103", "13104", "13105"]);
  });
});

describe("isEmptyCondition（制約なし判定）", () => {
  it("min/max とも未指定は制約なし", () => {
    expect(isEmptyCondition({})).toBe(true);
    expect(isEmptyCondition(undefined)).toBe(true);
  });
  it("片方でもあれば制約あり", () => {
    expect(isEmptyCondition({ min: 0 })).toBe(false);
    expect(isEmptyCondition({ max: 10 })).toBe(false);
  });
});

describe("matchesConditions（条件 AND・データなし除外・閉区間）", () => {
  const rows = buildUnitRows(UNITS, {
    area_km2: [A, B, C, D, E],
    pop_change_rate_2020_2050: [POP_A, POP_B, POP_C],
  });
  const row = (code: string) => rows.find((r) => r.code === code) as UnitRow;

  it("制約なし（全条件 空）は常に true", () => {
    expect(matchesConditions(row("13101"), {})).toBe(true);
  });

  it("単一条件：min 以上・max 以下は閉区間（境界を含む）", () => {
    expect(matchesConditions(row("13101"), { area_km2: { min: 11.6 } })).toBe(true); // 11.6>=11.6
    expect(matchesConditions(row("13101"), { area_km2: { max: 11.6 } })).toBe(true); // 11.6<=11.6
    expect(matchesConditions(row("13102"), { area_km2: { min: 11.6 } })).toBe(false); // 10.2<11.6
  });

  it("複数条件は AND（両方満たす街だけ true・重みづけしない・ADR-0012）", () => {
    // 面積 11 以上 かつ 人口増減 0 以上 → 千代田(11.6,+5%)=true、中央(10.2)=面積で落ちる
    const cond = { area_km2: { min: 11 }, pop_change_rate_2020_2050: { min: 0 } };
    expect(matchesConditions(row("13101"), cond)).toBe(true);
    expect(matchesConditions(row("13102"), cond)).toBe(false);
  });

  it("データなし（none）は条件が課されると除外（数値比較不能・ADR-0011）", () => {
    expect(matchesConditions(row("13104"), { area_km2: { min: 0 } })).toBe(false);
  });

  it("秘匿（suppressed）も条件が課されると除外", () => {
    expect(matchesConditions(row("13105"), { area_km2: { min: 0 } })).toBe(false);
  });

  it("データなし指標でも、その指標に制約が無ければ落とさない（他指標だけで絞る）", () => {
    // 新宿(13104)は area_km2=none だが、pop に条件は無く area にも条件が無ければ通る
    expect(matchesConditions(row("13104"), {})).toBe(true);
  });

  it("値0（present）は「未調査」と区別され比較対象（ADR-0011）", () => {
    // 港(13103)は pop=0%（present）。min:0 を満たす（0>=0）。
    expect(matchesConditions(row("13103"), { pop_change_rate_2020_2050: { min: 0 } })).toBe(true);
    // max:-0.01 は満たさない（0 > -0.01）＝0 を負側に含めない。
    expect(matchesConditions(row("13103"), { pop_change_rate_2020_2050: { max: -0.01 } })).toBe(
      false,
    );
  });
});

describe("filterUnitRows（AND 適用・順序保持・空結果）", () => {
  const rows = buildUnitRows(UNITS, {
    area_km2: [A, B, C, D, E],
    pop_change_rate_2020_2050: [POP_A, POP_B, POP_C],
  });

  it("条件なしは全件（順序保持）", () => {
    const out = filterUnitRows(rows, {});
    expect(out.map((r) => r.code)).toEqual(["13101", "13102", "13103", "13104", "13105"]);
  });

  it("面積 11 以上で千代田・港だけ残る（データなし新宿/文京は除外・順序保持）", () => {
    const out = filterUnitRows(rows, { area_km2: { min: 11 } });
    expect(out.map((r) => r.code)).toEqual(["13101", "13103"]);
  });

  it("誰も満たさない条件は空結果（0件）", () => {
    const out = filterUnitRows(rows, { area_km2: { min: 999 } });
    expect(out).toHaveLength(0);
  });
});

describe("sortUnitRows（安定・データなし末尾・向き）", () => {
  const rows = buildUnitRows(UNITS, {
    area_km2: [A, B, C, D, E], // 13101=11.6, 13102=10.2, 13103=20.4, 13104=none, 13105=suppressed
  });

  it("既定（metricKey=null）はコード昇順", () => {
    const out = sortUnitRows(rows, { metricKey: null, direction: "asc" });
    expect(out.map((r) => r.code)).toEqual(["13101", "13102", "13103", "13104", "13105"]);
  });

  it("面積 昇順：present を小さい順、データなしは末尾（向きに依らず）", () => {
    const out = sortUnitRows(rows, { metricKey: "area_km2", direction: "asc" });
    // 10.2(13102) < 11.6(13101) < 20.4(13103) → その後にデータなし(13104,13105)コード昇順
    expect(out.map((r) => r.code)).toEqual(["13102", "13101", "13103", "13104", "13105"]);
  });

  it("面積 降順：present を大きい順、データなしは依然末尾（小さい値扱いしない）", () => {
    const out = sortUnitRows(rows, { metricKey: "area_km2", direction: "desc" });
    expect(out.map((r) => r.code)).toEqual(["13103", "13101", "13102", "13104", "13105"]);
  });

  it("同値はコード昇順で安定（向きに依らずちらつかせない）", () => {
    const tie = buildUnitRows(
      [
        { code: "13103", name: "港区" },
        { code: "13101", name: "千代田区" },
      ],
      {
        area_km2: [
          { code: "13103", value: 15, status: "present" },
          { code: "13101", value: 15, status: "present" },
        ],
      },
    );
    const asc = sortUnitRows(tie, { metricKey: "area_km2", direction: "asc" });
    const desc = sortUnitRows(tie, { metricKey: "area_km2", direction: "desc" });
    // 同値ゆえ向きに依らずコード昇順（13101→13103）。
    expect(asc.map((r) => r.code)).toEqual(["13101", "13103"]);
    expect(desc.map((r) => r.code)).toEqual(["13101", "13103"]);
  });

  it("入力を破壊しない（コピーして並べ替える）", () => {
    const before = rows.map((r) => r.code);
    sortUnitRows(rows, { metricKey: "area_km2", direction: "asc" });
    expect(rows.map((r) => r.code)).toEqual(before);
  });
});
