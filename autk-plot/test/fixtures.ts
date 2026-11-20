/// <reference types="vite/client" />

import regions from '../../gallery/public/data/mnt_neighs_proj.geojson?raw';
import landuse from '../../usecases/public/data/mnt_neighs_proj_landuse.geojson?raw';

import type { Collection } from './synthetic';

export type { Collection } from './synthetic';
export { withSyntheticEvents, withSyntheticSeries } from './synthetic';

/**
 * Datasets the tests read; they are never modified. The neighborhoods come from
 * the gallery; the same neighborhoods with their land use, from the use cases.
 */
const DATASETS: Record<string, string> = {
    'mnt_neighs_proj.geojson': regions,
    'mnt_neighs_proj_landuse.geojson': landuse,
};

/**
 * Loads a fresh copy of a gallery GeoJSON dataset.
 *
 * Each call parses the file again, so two plots never share mutable feature objects.
 */
export function loadGalleryCollection(fileName: string): Collection {
    const text = DATASETS[fileName];
    if (text === undefined) throw new Error(`Unknown gallery dataset: ${fileName}`);
    return JSON.parse(text) as Collection;
}
