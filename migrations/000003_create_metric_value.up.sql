-- metric_value：縦持ち集計テーブル（1単位×1指標＝1行・ADR-0015）。
-- 事前集計（マテリアライズ）の置き場：取り込み時に「単位×指標」へ書き出し、ユーザー操作のたびの
-- 空間結合（オンデマンド）はしない。指標追加はスキーマ変更でなく行追加で済む（ADR-0015 (ii)）。
-- 値配信 GET /api/choropleth/values?metric=<key> がこの表を metric で引き、FE は setFeatureState で
-- 5桁コード結合して塗る（値とジオメトリの分離＝ADR-0016 (i) の継ぎ目）。
--
-- データなしの3区別（ADR-0011）を status に持つ＝「危険ゼロ」と「未調査」を混同させない：
--   present    … データがあり値が確定（該当なし＝0 もここ＝value=0・present）
--   none       … データなし（対象外・未整備）。value は NULL
--   suppressed … 秘匿（小人口メッシュ等で非公開）。value は NULL
-- 出典（source）は法的要件（ADR-0011 (c)）ゆえ NOT NULL。
CREATE TABLE metric_value (
    -- 集計単位の5桁コード。admin_unit.code と同形（結合キー・ADR-0014）。
    unit_id   char(5)          NOT NULL,
    -- 単位の種別。MVP は 'municipality'。メッシュ移行で 'mesh250' 等が増える（ADR-0015）。
    -- admin_unit と対の (unit_id, unit_kind) で、単位ポリゴンを差し替えれば同じ表が効く。
    unit_kind text             NOT NULL DEFAULT 'municipality',
    -- 指標キー（例 'area_km2'）。値API が WHERE metric=$1 で引く軸。指標追加＝この値が増える。
    metric    text             NOT NULL,
    -- 数値。status!='present' のときは NULL（データなし/秘匿は値を持たない）。
    value     double precision,
    -- データなし3区別（ADR-0011）。下の CHECK で許可値と value との整合を担保する。
    status    text             NOT NULL DEFAULT 'present',
    -- 年度（指標の版）。面積のように年度を持たない指標は NULL。
    -- NULL は一意性判定で互いに区別される（distinct 扱い）ため、PK には使わず下の
    -- 式 UNIQUE 索引（COALESCE で sentinel 化）で重複を確実に弾く（NULL を含むPK問題の回避）。
    year      int,
    -- 出典（ADR-0011 (c) 法的要件）。算出指標は算出元を記す（例：N03 由来の ST_Area 算出）。
    source    text             NOT NULL,

    -- status の許可値（3区別を DB 側でも固定）。
    CONSTRAINT metric_value_status_check
        CHECK (status IN ('present', 'none', 'suppressed')),
    -- value と status の整合：present は値必須・それ以外は値を持たない（該当なし=0 は present かつ value=0）。
    -- 「値なしの present（空欄ごまかし）」と「値ありの none/suppressed（矛盾）」を両方弾く。
    CONSTRAINT metric_value_status_value_check
        CHECK (
            (status = 'present'     AND value IS NOT NULL)
            OR
            (status IN ('none', 'suppressed') AND value IS NULL)
        ),
    -- 5桁の形式チェック（admin_unit と同基準・ADR-0014 値域）。
    CONSTRAINT metric_value_unit_id_format CHECK (unit_id ~ '^[0-9]{5}$'),

    -- 集計単位の実在を担保（admin_unit の (code, unit_kind) を参照）。
    -- 単位が消えたら値も消す（ON DELETE CASCADE）：単位ポリゴンの入れ替え（pref 単位 DELETE→INSERT）に追従。
    CONSTRAINT metric_value_unit_fk
        FOREIGN KEY (unit_id, unit_kind) REFERENCES admin_unit (code, unit_kind) ON DELETE CASCADE
);

-- 一意性：1単位×1指標×1種別×1年度で1行。year の NULL を sentinel(-1) に畳んで「年度なし同士」も重複させない
-- （素の UNIQUE は NULL を distinct 扱いし重複を許すため、式索引で確実に1行へ縛る）。
CREATE UNIQUE INDEX metric_value_unique
    ON metric_value (metric, unit_kind, unit_id, (COALESCE(year, -1)));

-- 値API（GET /api/choropleth/values?metric=）は (metric, unit_kind) で全単位を引く。引きの軸に索引を張る。
-- 上の式 UNIQUE 索引は先頭が (metric, unit_kind, ...) で同じ前方一致に使えるため、専用索引は重複になる。
-- よってここでは新設せず、metric_value_unique を引きにも流用する（索引の二重持ちを避ける）。
