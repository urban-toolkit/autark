import { readdir } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { NITEROI_PBF } from '../src/niteroi/config';
import { CHICAGO_PBF } from '../src/shadows/config';
import { DATASETS, MANHATTAN_PBF } from '../src/urbane/config';

it('serves only datasets used by the three examples, with no inactive extracts or markdown', async () => {
    expect(await readdir(new URL('../public/', import.meta.url))).toEqual(['data']);
    const files = await readdir(new URL('../public/data/', import.meta.url));
    expect(files.sort()).toEqual([
        NITEROI_PBF, CHICAGO_PBF, MANHATTAN_PBF,
        'niteroi_lst_verao_2001_2024.tif', 'shadows_chicago.csv', 'mnt_neighs.geojson',
        ...DATASETS.map(dataset => `${dataset}_manhattan_clean.csv`),
    ].sort());
});
