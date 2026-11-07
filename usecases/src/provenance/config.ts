/**
 * Settings of the provenance case study.
 */

import type { FilterCondition } from '@urban-toolkit/autk-plot';

/** Plot height shared by every chart; the width follows its card (`width: 'auto'`). */
export const PLOT_HEIGHT = 280;

/** A page filter: the text of its option and the condition every plot applies. */
export type PageFilter = { label: string; condition: FilterCondition };

/**
 * Filters of the page select, over the region properties. Another dataset
 * only needs its own list here; the select and the plots read it as is.
 */
export const FILTERS: PageFilter[] = [
    { label: 'Area > 10 M m²', condition: { attribute: 'shape_area', op: '>', value: 10_000_000 } },
    { label: 'Residential', condition: { attribute: 'landuse', op: '==', value: 'Residential' } },
    { label: 'Mixed or commercial', condition: { attribute: 'landuse', op: 'in', value: ['Mixed', 'Commercial'] } },
];

/** Map layer holding the regions, the same features every plot reads. */
export const MAP_LAYER = 'neighborhoods';

/** Dataset files: Manhattan regions (EPSG:3395) and the March 2025 noise complaints. */
export const DATA_FILES = {
    regions: 'mnt_neighs_proj_landuse.geojson',
    noise: 'noise_manhattan_clean.csv',
};

/** Dataset URLs, under the page base, as in the other use cases. */
export const DATA = {
    regions: `${import.meta.env.BASE_URL}data/${DATA_FILES.regions}`,
    noise: `${import.meta.env.BASE_URL}data/${DATA_FILES.noise}`,
};
