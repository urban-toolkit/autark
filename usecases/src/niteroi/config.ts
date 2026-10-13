export const NITEROI_AREA = { geocodeArea: 'Rio de Janeiro', areas: ['Niterói'] };
export const NITEROI_PBF = 'niteroi.osm.pbf';

export const BAND_COUNT = 24;
export const START_YEAR = 2001;
export const ROADS_LAYER = 'table_osm_roads';
export const HIGHLIGHT_COLOR = '#1a7a2e';
export type ColorMode = 'angle' | 'year';

export function yearBand(year: number): string {
    if (!Number.isInteger(year) || year < START_YEAR || year >= START_YEAR + BAND_COUNT) {
        throw new Error(`Year must be between ${START_YEAR} and ${START_YEAR + BAND_COUNT - 1}.`);
    }
    return `band_${year - START_YEAR + 1}`;
}
