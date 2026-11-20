import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Feature } from 'geojson';
import { loadDb } from '../src/duckdb-node';
import { getRasterPayload } from '../src/raster-store';
import type { BuildHeatmapParams } from '../src/use-cases/build-heatmap';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../src/duckdb', () => ({ loadDb: async () => native.db }));
import { AutkDb } from '../src/db';

let db: AutkDb;
let serial = 0;
beforeAll(async () => {
  native.db = await loadDb(); vi.stubGlobal('self', globalThis);
  db = new AutkDb(); await db.init();
}, 120_000);
afterAll(async () => { await (db as any)?.conn?.close(); await native.db?.terminate(); vi.unstubAllGlobals(); });

const point = (x: number, y: number, properties: Record<string, unknown>): Feature => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties,
});

/** Loads `readings` into a workspace of its own, which takes its extent from them. */
async function loadReadings(features: Feature[]) {
  await db.setWorkspace(`heatmap_${++serial}`, { coordinateFormat: 'EPSG:4326', precisionGrid: 1e-10 });
  await db.loadGeojson({ outputTableName: 'readings', coordinateFormat: 'EPSG:4326',
    geojsonObject: { type: 'FeatureCollection', features } });
}

/** Each band of the heatmap's raster by its label, its cells row by row from the south. */
function bandsOf(table: string): Record<string, number[]> {
  const payload = getRasterPayload(db.getCurrentWorkspace(), table)!;
  return Object.fromEntries(payload.bands.map(band => [band.label, Array.from(payload.values[band.id])]));
}

/** A band's cells, row by row from the south, against *expected*, to float32's precision. */
function expectCells(cells: ArrayLike<number>, expected: number[]) {
  expect(cells).toHaveLength(expected.length);
  expected.forEach((value, index) => expect(cells[index]).toBeCloseTo(value, 5));
}

describe('heatmap cells hold the aggregate of the rows near their center', () => {
  // A box 3 wide and 2 high in 3 by 2 unit cells. The readings at its corners give the workspace its extent and
  // lie 0.71 from every cell center, past the 0.6 the heatmap reaches; every other reading lies within 0.1 of the
  // center of its own cell. Cells from the south-west: (0.5, 0.5), (1.5, 0.5), (2.5, 0.5), (0.5, 1.5), ...
  const readings = [
    point(0, 0, { value: 1000 }), point(3, 2, { value: -1000 }),
    point(0.5, 0.5, { value: 2 }),
    point(1.5, 0.5, { value: 4 }), point(1.6, 0.5, { value: 8 }),
    point(0.5, 1.5, { value: 3 }), point(0.6, 1.5, { value: 6 }), point(0.4, 1.5, { value: 12 }),
    point(1.5, 1.5, { value: 10 }),
    point(2.5, 1.5, { value: 1 }), point(2.5, 1.6, { value: 5 }),
  ];

  it('builds avg, sum, min and max cells from the values near each center, as it builds count and weighted', async () => {
    await loadReadings(readings);
    await db.buildHeatmap({
      tableJoinName: 'readings', outputTableName: 'heat', near: { distance: 0.6 }, grid: { rows: 2, columns: 3 },
      groupBy: [
        { column: '*', aggregateFn: 'count' }, { column: '*', aggregateFn: 'weighted' },
        { column: 'value', aggregateFn: 'sum' }, { column: 'value', aggregateFn: 'avg' },
        { column: 'value', aggregateFn: 'min' }, { column: 'value', aggregateFn: 'max' },
      ],
    });

    const bands = bandsOf('heat');
    expect(Object.keys(bands)).toEqual([
      'count_readings', 'weighted_readings', 'sum_readings', 'avg_readings', 'min_readings', 'max_readings',
    ]);
    expect(bands.count_readings).toEqual([1, 2, 0, 3, 1, 2]);
    expect(bands.sum_readings).toEqual([2, 12, 0, 21, 10, 6]);
    expect(bands.avg_readings).toEqual([2, 6, 0, 7, 10, 3]);
    expect(bands.min_readings).toEqual([2, 4, 0, 3, 10, 1]);
    expect(bands.max_readings).toEqual([2, 8, 0, 12, 10, 5]);
    // 1 / (distance + 1) for each reading near the center.
    const weighted = [1, 1 + 1 / 1.1, 0, 1 + 2 / 1.1, 1, 1 + 1 / 1.1];
    bands.weighted_readings.forEach((cell, index) => expect(cell).toBeCloseTo(weighted[index], 5));
  });

  it.each<[string, Pick<BuildHeatmapParams, 'groupBy'>]>([
    ['without groupBy', {}],
    ['with an empty groupBy', { groupBy: [] }],
  ])('counts the rows near each center in the one band of a heatmap %s', async (_label, fields) => {
    await loadReadings(readings);
    const table = await db.buildHeatmap({
      tableJoinName: 'readings', outputTableName: 'counted', near: { distance: 0.6 }, grid: { rows: 2, columns: 3 },
      ...fields,
    });

    // The band a `{ column: '*', aggregateFn: 'count' }` entry builds: its id, its label and the counts the first test reads.
    const count = [{ id: 'band_1', label: 'count_readings' }];
    expect(table.bands).toEqual(count);
    expect(getRasterPayload(db.getCurrentWorkspace(), 'counted')!.bands).toEqual(count);
    expect(bandsOf('counted')).toEqual({ count_readings: [1, 2, 0, 3, 1, 2] });
  });

  it('builds a normalized band from the values the join rescales from 0 to 1 across the cells', async () => {
    await loadReadings(readings);
    await db.buildHeatmap({
      tableJoinName: 'readings', outputTableName: 'scaled', near: { distance: 0.6 }, grid: { rows: 2, columns: 3 },
      groupBy: [
        { column: 'value', aggregateFn: 'avg', normalize: true },
        { column: '*', aggregateFn: 'count', normalize: true },
      ],
    });

    // The averages 2, 6, 0, 7, 10, 3 and the counts 1, 2, 0, 3, 1, 2, each from its least to its greatest.
    const payload = getRasterPayload(db.getCurrentWorkspace(), 'scaled')!;
    expectCells(payload.values.band_1, [0.2, 0.6, 0, 0.7, 1, 0.3]);
    expectCells(payload.values.band_2, [1 / 3, 2 / 3, 0, 1, 1 / 3, 2 / 3]);
  });

  it('keeps normalized bands separate from raw columns with a _norm suffix', async () => {
    await loadReadings(readings.map(feature => ({
      ...feature, properties: { ...feature.properties, value_norm: 100 * (feature.properties?.value as number) },
    })));
    await db.buildHeatmap({
      tableJoinName: 'readings', outputTableName: 'mixed', near: { distance: 0.6 }, grid: { rows: 2, columns: 3 },
      groupBy: [
        { column: 'value', aggregateFn: 'avg', normalize: true },
        { column: 'value_norm', aggregateFn: 'avg' },
      ],
    });

    const payload = getRasterPayload(db.getCurrentWorkspace(), 'mixed')!;
    expectCells(payload.values.band_1, [0.2, 0.6, 0, 0.7, 1, 0.3]);
    expectCells(payload.values.band_2, [200, 600, 0, 700, 1000, 300]);
  });

  it('labels each band so that a label names one band', async () => {
    await loadReadings(readings.map(feature => ({
      ...feature, properties: { ...feature.properties, other: 2 * (feature.properties?.value as number) },
    })));
    await db.buildHeatmap({
      tableJoinName: 'readings', outputTableName: 'labelled', near: { distance: 0.6 }, grid: { rows: 2, columns: 3 },
      groupBy: [
        { column: 'value', aggregateFn: 'avg' },
        { column: 'other', aggregateFn: 'avg' },
        { column: 'value', aggregateFn: 'avg', normalize: true },
        { column: 'value', aggregateFn: 'max' },
        { column: '*', aggregateFn: 'count' },
      ],
    });

    // The two averages of different columns name their columns; the normalized one, the max and the count need not.
    const bands = bandsOf('labelled');
    expect(Object.keys(bands)).toEqual([
      'avg_readings_value', 'avg_readings_other', 'avg_readings_norm', 'max_readings', 'count_readings',
    ]);
    expect(bands.avg_readings_value).toEqual([2, 6, 0, 7, 10, 3]);
    expect(bands.avg_readings_other).toEqual([4, 12, 0, 14, 20, 6]);
  });

  it('assigns distinct labels to dotted and underscored columns without renaming unrelated bands', async () => {
    await loadReadings(readings.map(feature => {
      const value = feature.properties?.value as number;
      return { ...feature, properties: { a: { b: value }, a_b: 2 * value, a_b_band_2: 3 * value } };
    }));
    await db.buildHeatmap({
      tableJoinName: 'readings', outputTableName: 'distinct', near: { distance: 0.6 }, grid: { rows: 2, columns: 3 },
      groupBy: [
        { column: 'a.b', aggregateFn: 'avg' },
        { column: 'a_b', aggregateFn: 'avg' },
        { column: 'a_b_band_2', aggregateFn: 'avg' },
      ],
    });

    const payload = getRasterPayload(db.getCurrentWorkspace(), 'distinct')!;
    const labels = payload.bands.map(band => band.label);
    expect(new Set(labels).size).toBe(3);
    expect(labels[2]).toBe('avg_readings_a_b_band_2');
    const bands = bandsOf('distinct');
    expect(bands[labels[0]]).toEqual([2, 6, 0, 7, 10, 3]);
    expect(bands[labels[1]]).toEqual([4, 12, 0, 14, 20, 6]);
    expect(bands[labels[2]]).toEqual([6, 18, 0, 21, 30, 9]);
  });

  it('reads a column whose name holds quotes and a nested key', async () => {
    const key = `it's "loud"`;
    await loadReadings([
      point(0, 0, { [key]: { db: 1000 } }), point(1, 1, { [key]: { db: 1000 } }),
      point(0.5, 0.5, { [key]: { db: 4 } }), point(0.55, 0.5, { [key]: { db: 6 } }),
    ]);
    await db.buildHeatmap({
      tableJoinName: 'readings', outputTableName: 'loudness', near: { distance: 0.6 }, grid: { rows: 1, columns: 1 },
      groupBy: [{ column: `${key}.db`, aggregateFn: 'avg' }, { column: `${key}.db`, aggregateFn: 'max' }],
    });

    expect(bandsOf('loudness')).toEqual({ avg_readings: [5], max_readings: [6] });
  });
});
