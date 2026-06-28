/**
 * 絞り込み・並べ替えの純ロジック（ADR-0012 「面で比べる」体験＝色分け＋絞り込み＋並べ替え一覧表）。
 *
 * MVP は 69 市区町村ゆえ**クライアント側で素直に**絞り込む（サーバ側の動的 WHERE＝生 SQL は v1/規模時の
 * 選択肢として申し送り・ADR-0015/0017・frontend-conventions §3）。本モジュールは React/取得層に依存しない
 * 純関数の集まり＝単体テストで手厚く固める（本丸＝状態ロジック・frontend-conventions §8）。
 *
 * 重みづけ（スコアリング）はしない＝各指標の条件を AND で課すだけ（ADR-0012）。
 * データなし（status≠present）の単位は数値比較が成立しないため、当該条件を課された時点で除外する
 * （「危険ゼロ」と「未調査」を混同しない・ADR-0011）。
 */

import type { MetricStatus, MetricValue } from "./values";

/**
 * 絞り込み・一覧の対象となる「1市区町村ぶんの全指標」（縦串）。
 *
 * `/values` は「1指標×全単位」を横に運ぶ（ADR-0016）ため、絞り込み（複数指標の AND）には
 * 単位ごとに全指標を寄せ直す必要がある。geometry（code/name）と各指標の値を code で突き合わせて組む。
 * `values`/`statuses` のキーは指標キー（metrics.ts registry のキー＝`area_km2` 等）。
 */
export interface UnitRow {
  /** 市区町村の5桁コード（geometry の feature.id と一致＝結合キー）。 */
  code: string;
  /** 市区町村名（一覧の左端・表示用）。 */
  name: string;
  /** 指標キー→値（数値）。データなし/秘匿は null。 */
  values: Record<string, number | null>;
  /** 指標キー→状態（ADR-0011 3区別）。絞り込みの「present のみ比較可」判定に使う。 */
  statuses: Record<string, MetricStatus>;
}

/**
 * 1指標への数値条件（境目）。min/max は任意（未指定＝その向きの制約なし）。
 *
 * 重みづけはしない＝単に「min 以上 かつ max 以下」を課すだけ（ADR-0012）。両端は閉区間（以上・以下）。
 * 両方 undefined の条件は「制約なし」として扱う（絞り込みに影響しない）。
 */
export interface MetricCondition {
  /** 下限（以上）。undefined＝下限なし。 */
  min?: number;
  /** 上限（以下）。undefined＝上限なし。 */
  max?: number;
}

/** 並べ替えの向き。 */
export type SortDirection = "asc" | "desc";

/**
 * 一覧の並べ替え指定（指標キー＋向き）。`metricKey` が null＝名称（code）順の既定並び。
 */
export interface SortSpec {
  /** 並べ替えに使う指標キー（null＝既定＝コード昇順）。 */
  metricKey: string | null;
  /** 向き（昇順/降順）。 */
  direction: SortDirection;
}

/**
 * 指標値配列（1指標×全単位）の束を code で突き合わせ、単位ごとの全指標行（{@link UnitRow}）へ組み直す。
 *
 * @param units 単位の素（geometry 由来の code/name の並び＝表示順の母体）。
 * @param valuesByMetric 指標キー→その指標の `/values` 応答（全単位ぶん）。
 *
 * geometry を母体にする理由：表示対象（描画される区）は geometry が定義する。`/values` 側に
 * geometry に無い code があっても無視する（描けない単位を一覧に出さない）。geometry にあって値が
 * 無い指標は status を `none`（データなし）として埋める＝黙って欠かさない（ADR-0011）。
 */
export function buildUnitRows(
  units: ReadonlyArray<{ code: string; name: string }>,
  valuesByMetric: Record<string, ReadonlyArray<MetricValue>>,
): UnitRow[] {
  // 指標ごとに code→値 の索引を作る（単位×指標の二重ループでの線形探索を避ける）。
  const indexByMetric: Record<string, Map<string, MetricValue>> = {};
  for (const [metricKey, list] of Object.entries(valuesByMetric)) {
    const idx = new Map<string, MetricValue>();
    for (const v of list) {
      idx.set(v.code, v);
    }
    indexByMetric[metricKey] = idx;
  }

  return units.map((u) => {
    const values: Record<string, number | null> = {};
    const statuses: Record<string, MetricStatus> = {};
    for (const metricKey of Object.keys(valuesByMetric)) {
      const hit = indexByMetric[metricKey]?.get(u.code);
      if (hit) {
        values[metricKey] = hit.value;
        statuses[metricKey] = hit.status;
      } else {
        // geometry にあるが当該指標の応答に無い＝未整備として none（空欄や0でごまかさない・ADR-0011）。
        values[metricKey] = null;
        statuses[metricKey] = "none";
      }
    }
    return { code: u.code, name: u.name, values, statuses };
  });
}

/**
 * 1つの数値条件が「制約なし」か（min/max とも未指定）。制約なしの条件は絞り込みに効かせない。
 */
export function isEmptyCondition(cond: MetricCondition | undefined): boolean {
  return !cond || (cond.min === undefined && cond.max === undefined);
}

/**
 * 1単位が、与えた全条件（指標キー→条件）を AND で満たすか判定する（ADR-0012 重みづけしない＝AND）。
 *
 * - 制約なしの条件（min/max とも未指定）は無視＝その指標では絞らない。
 * - データなし（status≠present）の指標に制約が課されている場合は**満たさない**＝除外
 *   （数値比較が成立しない・「未調査」を「条件内」に紛れ込ませない・ADR-0011）。値0（present）は比較対象。
 * - 境界は閉区間（min 以上・max 以下）。
 */
export function matchesConditions(
  row: UnitRow,
  conditions: Record<string, MetricCondition>,
): boolean {
  for (const [metricKey, cond] of Object.entries(conditions)) {
    if (isEmptyCondition(cond)) {
      continue; // 制約なし＝この指標では絞らない。
    }
    // データなし/秘匿は数値比較不能＝制約が課された時点で不一致（除外・ADR-0011）。
    if (row.statuses[metricKey] !== "present") {
      return false;
    }
    const value = row.values[metricKey];
    // present なら数値が入る前提だが、型上 null 可ゆえ守る（null は比較不能＝不一致）。
    if (value === null || value === undefined) {
      return false;
    }
    if (cond.min !== undefined && value < cond.min) {
      return false;
    }
    if (cond.max !== undefined && value > cond.max) {
      return false;
    }
  }
  return true;
}

/**
 * 全単位行に条件（AND）を課し、合致する行だけ返す（ADR-0012）。入力順を保つ（並べ替えは別関数）。
 *
 * @param rows 単位行（{@link buildUnitRows} の出力）。
 * @param conditions 指標キー→数値条件。空（全て制約なし）なら全行が通る。
 */
export function filterUnitRows(
  rows: ReadonlyArray<UnitRow>,
  conditions: Record<string, MetricCondition>,
): UnitRow[] {
  return rows.filter((r) => matchesConditions(r, conditions));
}

/**
 * 1指標の値域 [min,max]（**present かつ数値**の値だけから）を返す（④・スライダー両端・ADR-0028）。
 *
 * データなし/秘匿（status≠present・value=null）は数値でないため除外する（「未調査」を 0 や端値に
 * 化けさせない・ADR-0011）。**値が1つも無ければ null**＝その指標はスライダーを出せない（呼び側で除外）。
 *
 * @param values 1指標×全単位の値配列（`/values` 応答・ADR-0016）。
 */
export function metricValueRange(
  values: ReadonlyArray<MetricValue>,
): { min: number; max: number } | null {
  const nums = values
    .filter((v) => v.status === "present" && v.value !== null)
    .map((v) => v.value as number);
  if (nums.length === 0) {
    return null;
  }
  return { min: Math.min(...nums), max: Math.max(...nums) };
}

/**
 * 一覧を指定の並べ替え（指標キー＋向き）で安定ソートして返す（ADR-0012 並べ替え一覧表）。
 *
 * - `metricKey` が null＝コード昇順（既定の安定並び）。
 * - **データなし（present でない）は常に末尾**へ集める（昇順/降順に関わらず）＝「値が無い」を
 *   小さい値とも大きい値とも扱わない（ADR-0011）。データなし同士・同値同士はコード昇順で安定させる
 *   （並べ替えのちらつき防止・frontend-conventions §8 並べ替え安定）。
 *
 * @param rows 並べ替え対象（通常は {@link filterUnitRows} の結果）。
 * @param spec 並べ替え指定。
 */
export function sortUnitRows(rows: ReadonlyArray<UnitRow>, spec: SortSpec): UnitRow[] {
  const sorted = [...rows];
  const { metricKey, direction } = spec;

  sorted.sort((a, b) => {
    if (metricKey === null) {
      // 既定＝コード昇順（向きに関わらず安定な母体順）。
      return compareCode(a, b);
    }

    const aHas = a.statuses[metricKey] === "present" && a.values[metricKey] !== null;
    const bHas = b.statuses[metricKey] === "present" && b.values[metricKey] !== null;

    // データなしは常に末尾（向きに依らない）。両方なしはコードで安定。
    if (!aHas && !bHas) {
      return compareCode(a, b);
    }
    if (!aHas) {
      return 1;
    }
    if (!bHas) {
      return -1;
    }

    const av = a.values[metricKey] as number;
    const bv = b.values[metricKey] as number;
    if (av !== bv) {
      return direction === "asc" ? av - bv : bv - av;
    }
    // 同値はコード昇順で安定（向きに依らず＝ちらつかせない）。
    return compareCode(a, b);
  });
  return sorted;
}

/** コード昇順の比較（安定並びの母体・同値時のタイブレーク）。 */
function compareCode(a: UnitRow, b: UnitRow): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}
