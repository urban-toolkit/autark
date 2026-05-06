import type { GeoJsonProperties } from 'geojson';

/**
 * Datum contract bound to interactive marks.
 *
 * `autkIds` must always reference source feature indices from the original
 * input collection (never DOM position indices).
 */
export type AutkDatum = GeoJsonProperties & {
    /** Source feature indices from the original GeoJSON input collection. */
    autkIds?: number[];
};
