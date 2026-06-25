-- admin_unit：集計の単位ポリゴン（MVP＝市区町村/区粒度）。
-- 結合基盤の的（ADR-0014）：境界は国土数値情報 行政区域 N03、結合キーは5桁市区町村コード
-- （XIT002.id を権威に、N03_007 等を5桁へ寄せる）。保存 SRID＝6668（JGD2011・ADR-0014）。
-- 段0 では空表のみ作る（データ投入は段1＝N03 取り込み・backend-conventions §5）。
--
-- なぜ unit_kind を持たせるか：メッシュ移行の継ぎ目（ADR-0015）。MVP は 'municipality' 固定だが、
-- 将来 'mesh250' 等を同じ表/集計に差し替えられるよう、識別子に種別を同居させる
-- （metric_value の (unit_id, unit_kind) と対になる）。
CREATE TABLE admin_unit (
    -- 5桁市区町村コード（文字列：先頭0を保つため数値にしない）。
    code      char(5)      NOT NULL,
    -- 単位の種別。MVP は 'municipality'（区粒度）。メッシュ移行で値が増える（ADR-0015）。
    unit_kind text         NOT NULL DEFAULT 'municipality',
    -- 表示用名称（名称ゆれは表示用・結合はコードで行う・ADR-0014）。
    name      text         NOT NULL,
    -- 都道府県コード（code の上2桁）。値域チェックの根拠（上2桁が pref と一致・ADR-0014）。
    pref_code char(2)      NOT NULL,
    -- 境界ポリゴン。MultiPolygon（飛び地・島嶼で単一 Polygon にならないため）・SRID 6668。
    geom      geometry(MultiPolygon, 6668),

    PRIMARY KEY (code, unit_kind),
    -- 5桁の形式チェック（数字5桁）。投入時の取り違えを DB 側でも弾く。
    CONSTRAINT admin_unit_code_format CHECK (code ~ '^[0-9]{5}$'),
    -- 上2桁＝pref_code の整合（ADR-0014 の値域チェックをスキーマで担保）。
    CONSTRAINT admin_unit_pref_prefix CHECK (left(code, 2) = pref_code)
);

-- 空間索引（GiST）。空間クエリ（交差・内包・近傍）の前提（ADR-0013）。
CREATE INDEX admin_unit_geom_gist ON admin_unit USING gist (geom);
