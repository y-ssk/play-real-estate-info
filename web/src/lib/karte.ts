/**
 * カルテ（街を選ぶと出る詳細パネル・ADR-0011）の取得層。
 *
 * 値配信（/values）が「1指標×全単位」を横に運ぶのに対し、カルテは選択した単位（ADR-0018 識別子）の
 * 「全指標」を縦に運ぶ＝素性を分野横断で集める。データなし3区別（status）・推計の基準年（year）・出典（source）を
 * 各指標に添える（ADR-0011/0009）。表示名・単位・整形は features/choropleth/metrics.ts の registry を流用する
 * （二重管理しない・frontend-conventions §5）。
 */

import type { SelectedUnit } from "./selection";
import type { MetricStatus } from "./values";

/**
 * カルテ1指標ぶん（`/api/karte` 応答の metrics 要素）。
 *
 * value は数値 or null（null＝データなし/秘匿）。該当なし＝0 は value=0・status=present
 * （「危険ゼロ」と「未調査」を混同しない・ADR-0011）。year は指標の版（面積のように年度を持たない指標は
 * null／将来人口は推計の到達年 2050・ADR-0009）。source は法的要件ゆえ常に文字列（ADR-0011 (c)）。
 */
export interface KarteMetric {
  /** 指標キー（metrics.ts registry の表示名・単位・整形に対応）。 */
  metric: string;
  /** 指標値。null＝データなし/秘匿。 */
  value: number | null;
  /** 値の状態（ADR-0011 3区別）。 */
  status: MetricStatus;
  /** 年度 or null（指標の版。推計は到達年・ADR-0009）。 */
  year: number | null;
  /** 出典（法的要件・ADR-0011 (c)）。推計は文言に「推計」を含む。 */
  source: string;
}

/**
 * `GET /api/karte?unit_id=` の応答（選択単位のカルテ・ADR-0011 骨組み）。
 *
 * 指標を1つも持たない単位でも `metrics` は空配列で返る（単位は実在＝カルテは空でも出す）。
 * 指標が増えれば `metrics` が伸びる（比較ビュー v1 で骨組みを再利用する前提・ADR-0011）。
 */
export interface Karte {
  /** 5桁市区町村コード（選択単位の unitId）。 */
  code: string;
  /** 表示名（例：千代田区）。 */
  name: string;
  /** 都県コード（code 上2桁）。 */
  pref_code: string;
  /** 当該単位の全指標（0 件でも []）。 */
  metrics: KarteMetric[];
}

/** カルテAPI のパス。dev では Rsbuild が :8080 の Go へ転送する（rsbuild.config.ts proxy）。 */
const KARTE_PATH = "/api/karte";

/**
 * fetchKarte は選択単位のカルテを取得する（ADR-0011/0018）。
 *
 * 取得・キャッシュ・失敗の管理は呼び出し側の TanStack Query に委ねる（ADR-0018）＝ここは fetch と
 * 型付けに徹し、HTTP エラーは投げて Query の error 経路へ渡す。識別子は {unitKind, unitId}（裸の文字列にしない）
 * だが、MVP は unitKind を公開クエリに載せず内部既定（municipality・サーバ側）に委ねる＝メッシュ移行の継ぎ目。
 *
 * @param unit 選択単位（ADR-0018 識別子）。
 */
export async function fetchKarte(unit: SelectedUnit): Promise<Karte> {
  const res = await fetch(`${KARTE_PATH}?unit_id=${encodeURIComponent(unit.unitId)}`);
  if (!res.ok) {
    throw new Error(`カルテの取得に失敗しました (HTTP ${res.status})`);
  }
  return (await res.json()) as Karte;
}
