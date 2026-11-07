import { readdir } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { NITEROI_PBF } from '../src/niteroi/config';
import { DATA_FILES as PROVENANCE_DATA } from '../src/provenance/config';
import { CHICAGO_PBF } from '../src/shadows/config';
import { DATASETS, MANHATTAN_PBF } from '../src/urbane/config';

it('serves only datasets used by the examples, with no inactive extracts or markdown', async () => {
    expect(await readdir(new URL('../public/', import.meta.url))).toEqual(['data']);
    const files = await readdir(new URL('../public/data/', import.meta.url));
    // Files shared by two examples (the noise complaints) are served once.
    expect(files.sort()).toEqual([...new Set([
        NITEROI_PBF, CHICAGO_PBF, MANHATTAN_PBF,
        'niteroi_lst_verao_2001_2024.tif', 'shadows_chicago.csv', 'mnt_neighs.geojson',
        ...DATASETS.map(dataset => `${dataset}_manhattan_clean.csv`),
        ...Object.values(PROVENANCE_DATA),
    ])].sort());
});
