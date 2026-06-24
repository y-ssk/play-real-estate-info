# ADR-0018: FE状態管理＝サーバ状態TanStack Query＋クライアント状態Zustand（選択単位は{unit_kind, unit_id}）

- ステータス: 承認
- 日付: 2026-06-25
- 関連: `docs/99_decision-register.md`（優先3 受け渡し仕様・3-3 状態管理/取得）／`docs/02_architecture.md` §7フロント／`ADR-0013`（React・MapLibre GL JS・可逆な決定）／`ADR-0016`（配信の形・`setFeatureState`）／`ADR-0015`（`unit_kind`で市区町村↔メッシュ差し替え）／`ADR-0012`（ピン留めlocalStorage・絞り込み）／`ADR-0011`（データなし3区別）／学習メモ `docs/notes/2026-06-25-fe-state-management.md`

## なぜ（背景・課題）
受け渡しの形（`ADR-0016`/`0017`）が決まり、FE がそれをどう取得し状態として持つかを決める段（優先3-3）。FE の状態は性質の異なる2種類で、混ぜないのが定石：**サーバ状態**（API由来＝キャッシュ/再取得/失敗）と**クライアントUI状態**（選択中の指標/分野/単位・絞り込み・パネル開閉・ピン）。加えて v1 のメッシュ移行で単位の**粒度が変わる**ため、識別子に継ぎ目が要る（`ADR-0015` の延長／MVP集中はv1の構造変更を無視する意味ではない）。

## 結論（決定）
- **サーバ状態＝TanStack Query**：JSON系（`values`・`karte`・絞り込み）のキャッシュ/再取得/loading/error を宣言的に。geometry/タイルは行き先A（`ADR-0016`）で **MapLibre が自前取得**するため Query の守備範囲外（初手B の GeoJSON 期だけ Query が持てる）。
- **クライアントUI状態＝Zustand**：複数機能（map/filters/karte/comparison/一覧）で共有し、selector で必要分だけ購読。純ローカルは `useState`。
- **ピン留め＝Zustand `persist` → localStorage**（`ADR-0012`/`0013`）。
- **選択中の単位は `{unit_kind, unit_id}` で持つ**（Zustand・Query のキャッシュキー・将来の URL すべて）。裸の市区町村コードにしない＝メッシュ移行（`ADR-0015`）で store/URL/キャッシュを作り直さない継ぎ目。
- **状態の真実は Zustand、MapLibre の `setFeatureState` は描画の鏡**（二重管理しない）。
- **Redux・自前fetch は不採用**。

URL を状態にする（共有リンク化）は MVP で決めず保留。ただし保留条件として「識別子は `{unit_kind, unit_id}` で持つ」を明記（後から URL 化しても粒度移行に耐える）。

## 検討した代替案と捨てた理由
- **Jotai（有力対案）**… atom（最小単位）で細粒度・派生に強く、URL/localStorage同期のユーティリティが宣言的。だが本MVPの共有UI状態は少数で、Zustand の単一store＋selector部分購読で見通しよく収まり、atom分割の粒度設計コストが利得を上回る。`persist` も Zustand が素直。**URL状態を早期に重視・状態が多数/細粒度/複雑な派生に育つなら Jotai が優位に転じうる**（可逆・再評価可）。落とす理由の詳細は学習メモ（技術選定の一般則として深掘り）。
- **SWR＋組み込みContext**… 最軽量だが、指標切替のキャッシュ・欠損/error の一貫性で Query の宣言性に劣る。昇格元としては可。
- **Redux Toolkit**… 定型コードが重く、MVPのUI状態には過剰（周辺は薄く）。
- **自前fetch（`fetch`＋`useEffect`）**… キャッシュ・失敗・競合を再発明＝誤りやすい。

## 影響（結果・トレードオフ）
- 優先3-3 が確定。残る優先3 は 3-4 ベースマップ調達先のみ。
- 識別子 `{unit_kind, unit_id}` を FE 実装の前提として最初から課す（メッシュ移行の継ぎ目）。
- URL状態は保留（粒度条件付き）。BE共通お作法（誤り処理・ロギング・トランザクション境界・レート制御）はバックログへ。
- **FE実装お作法の置き場**（`frontend-conventions.md` 新設 or `DESIGN.md` 拡張）は FE実装着手時に決定し、BE（`backend-conventions.md`）に倣って `implementer`/`reviewer` へ配線する。今は ADR＋学習メモに留める。
- 道具は可逆（`ADR-0013`）。問題形状が変わったら Jotai 等へ再評価する余地を残す。
