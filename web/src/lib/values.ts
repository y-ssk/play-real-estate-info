/**
 * 値配信（`GET /api/choropleth/values?metric=`）の取得層（ADR-0016 値とジオメトリの分離）。
 *
 * 形（geometry）とは別経路で「指標値だけ」を取得し、FE は `setFeatureState` で5桁コード結合して塗る。
 * データなし3区別（ADR-0011）を `status` で運び、色抜きの判定に使う。
 */

/**
 * 指標値の状態（ADR-0011 データなし3区別）。
 * - `present`    … 値が確定（該当なし＝0 もここ＝value=0）
 * - `none`       … データなし（対象外・未整備）。value は null
 * - `suppressed` … 秘匿（小人口で非公開）。value は null
 */
export type MetricStatus = "present" | "none" | "suppressed";

/**
 * `/api/choropleth/values` の応答1件分（setFeatureState 向け）。
 *
 * value は数値 or null。null は status（none/suppressed）と合わせて「データなし＝色抜き」の判定に使う。
 * 該当なし＝0 は value=0・status=present（「危険ゼロ」と「未調査」を混同しない・ADR-0011）。
 */
export interface MetricValue {
  /** 市区町村の5桁コード（geometry の feature.id と一致＝結合キー）。 */
  code: string;
  /** 指標値。null＝データなし/秘匿。 */
  value: number | null;
  /** 値の状態（ADR-0011 3区別）。 */
  status: MetricStatus;
}

/** 値API のパス。dev では Rsbuild が :8080 の Go へ転送する（rsbuild.config.ts proxy）。 */
const VALUES_PATH = "/api/choropleth/values";

/**
 * fetchMetricValues は指定 metric の全単位の値を取得する（ADR-0016）。
 *
 * 取得・キャッシュ・失敗の管理は呼び出し側の TanStack Query に委ねる（ADR-0018）＝ここは fetch と
 * 型付けに徹し、HTTP エラーは投げて Query の error 経路へ渡す。
 *
 * @param metric 指標キー（例 `"area_km2"`）。
 */
export async function fetchMetricValues(metric: string): Promise<MetricValue[]> {
  const res = await fetch(`${VALUES_PATH}?metric=${encodeURIComponent(metric)}`);
  if (!res.ok) {
    throw new Error(`指標値の取得に失敗しました (HTTP ${res.status})`);
  }
  return (await res.json()) as MetricValue[];
}
