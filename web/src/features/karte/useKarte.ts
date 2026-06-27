import { useQuery } from "@tanstack/react-query";
import { type Karte, fetchKarte } from "../../lib/karte";
import type { SelectedUnit } from "../../lib/selection";

/**
 * カルテのキャッシュキー（ADR-0018）。
 *
 * **unitKind を含める**＝メッシュ移行（ADR-0015）で粒度が変わってもキャッシュが衝突しない継ぎ目
 * （裸のコードでキーを作らない・frontend-conventions §2）。
 */
function karteQueryKey(unit: SelectedUnit) {
  return ["karte", unit.unitKind, unit.unitId] as const;
}

/**
 * useKarte は選択単位のカルテを取得する Query フック（ADR-0011/0018）。
 *
 * unit が null（未選択）の間は問い合わせない（`enabled`）＝パネルが閉じている時に無駄な通信をしない。
 * カルテは JSON 系ゆえ TanStack Query の守備範囲（ADR-0018）。指標値は年度更新（極めて低頻度）ゆえ
 * 再フォーカスでの再取得は不要。
 *
 * @param unit 選択単位（null は未選択）。
 */
export function useKarte(unit: SelectedUnit | null) {
  return useQuery<Karte>({
    // unit!=null のときだけ呼ばれる（enabled）。キーは型上 unit を要するため非 null を前提に組む。
    queryKey: unit ? karteQueryKey(unit) : ["karte", "none"],
    queryFn: () => fetchKarte(unit as SelectedUnit),
    enabled: unit !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });
}
