import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { FeatureCollection } from 'geojson';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const engines = vi.hoisted(() => [] as AsyncDuckDB[]);
vi.mock('../src/duckdb', () => ({ loadDb: async () => {
  const { loadDb } = await import('../src/duckdb-node');
  const engine = await loadDb(); engines.push(engine); return engine;
} }));
import { AutkDb } from '../src/db';

let db: AutkDb;
beforeAll(async () => {
  vi.stubGlobal('self', globalThis);
  db = new AutkDb(); await db.init();
}, 120_000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { for (const engine of engines) await engine.terminate(); vi.unstubAllGlobals(); });

/** Squares of the given corners, one feature each, in degrees. */
function squares(...corners: [number, number][]): FeatureCollection {
  return { type: 'FeatureCollection', features: corners.map(([x, y]) => ({
    type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 0.01, y], [x + 0.01, y + 0.01], [x, y + 0.01], [x, y]]] },
  })) };
}

async function rows(table: string): Promise<number> {
  return Number((await (db as any).conn.query(`SELECT COUNT(*) AS n FROM ${(db as any).currentWorkspace}.${table}`)).toArray()[0].n);
}

async function load(name: string, collection: FeatureCollection) {
  await db.loadGeojson({ geojsonObject: collection, outputTableName: name, layerType: 'parks', coordinateFormat: 'EPSG:4326' });
}

describe('a table clipped to the workspace extent', () => {
  it('is reported when nothing of it is left, naming the table and the cause', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.setWorkspace('clip_empty');
    await load('first', squares([0, 0]));
    expect(warn).not.toHaveBeenCalled();

    await load('far', squares([10, 10], [11, 11]));

    expect(await rows('far')).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('Table "far"');
    expect(message).toContain('had 2 row(s)');
    expect(message).toContain('first geometry table');
  });

  it('is not reported when it lies inside the extent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.setWorkspace('clip_inside');
    await load('first', squares([0, 0], [0.5, 0.5]));
    await load('inside', squares([0.001, 0.001]));
    expect(await rows('inside')).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('is not reported when only some rows are clipped away, which is ordinary', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await db.setWorkspace('clip_partial');
    await load('first', squares([0, 0]));
    await load('some', squares([0.001, 0.001], [10, 10]));
    expect(await rows('some')).toBe(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
