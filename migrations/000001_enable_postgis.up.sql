-- PostGIS 拡張を有効化する（ADR-0013：スキーマの権威を SQL に置き拡張を明示制御）。
-- なぜ IF NOT EXISTS：postgis/postgis イメージは template から拡張が入る場合があり、
-- 再実行・別環境での冪等性を担保する。
CREATE EXTENSION IF NOT EXISTS postgis;
