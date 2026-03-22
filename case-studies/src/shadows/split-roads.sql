WITH base AS (
    SELECT
        *,
        GREATEST(CEIL(ST_Length(geometry) / 20.0)::INTEGER, 1) AS num_parts
    FROM table_osm_roads
    WHERE ST_GeometryType(geometry) = 'LINESTRING'
)
SELECT
    b.* EXCLUDE (geometry, num_parts),
    ST_LineSubstring(
        b.geometry,
        t.part_idx::DOUBLE / b.num_parts::DOUBLE,
        LEAST((t.part_idx + 1)::DOUBLE / b.num_parts::DOUBLE, 1.0)
    ) AS geometry
FROM base b
JOIN generate_series(0, (SELECT MAX(num_parts) - 1 FROM base)) t(part_idx)
ON t.part_idx < b.num_parts
