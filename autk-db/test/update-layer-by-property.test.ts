import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Feature, Point } from 'geojson';
import { loadDb } from '../src/duckdb-node';

const native = vi.hoisted(() => ({ db: undefined as AsyncDuckDB | undefined }));
vi.mock('../src/duckdb', () => ({ loadDb: async () => native.db }));
import { AutkDb } from '../src/db';

let db: AutkDb;
beforeAll(async () => {
  native.db = await loadDb(); vi.stubGlobal('self', globalThis);
  db = new AutkDb(); await db.init();
}, 120_000);
afterAll(async () => { await (db as any)?.conn?.close(); await native.db?.terminate(); vi.unstubAllGlobals(); });

/** A point with no GeoJSON id, whose properties carry its id under *key* (`id` by default) and a `value`. */
const zone = (id: number, value: number, coordinates: [number, number], key = 'id'): Feature => ({
  type: 'Feature', geometry: { type: 'Point', coordinates }, properties: { [key]: id, value },
});

describe('a layer update keyed by a property', () => {
  it('updates the row whose property matches, and only that row', async () => {
    // A workspace of its own, loaded in its CRS (EPSG:3395) on whole metres, so its centimetre grid moves no point.
    await db.setWorkspace('update_by_property');
    await db.loadGeojson({ outputTableName: 'zones', sourceCrs: 'EPSG:3395', geojsonObject: {
      type: 'FeatureCollection', features: [zone(11, 10, [0, 0]), zone(12, 20, [100, 100]), zone(13, 30, [200, 200])],
    } });
    // The property ids are not the rows' own numbers (1, 2, 3), and the update's one feature gets the GeoJSON id of
    // the first row (autk-feature-0), so a match on any key but the property would change another row or none.
    await db.updateTable({ tableName: 'zones', strategy: 'update', idColumn: 'properties.id', data: {
      type: 'FeatureCollection', features: [zone(12, 99, [150, 50])],
    } });

    const features = (await db.getLayer('zones')).features;
    expect(features).toHaveLength(3);
    const zones = Object.fromEntries(features.map(feature => [feature.properties?.id, {
      value: feature.properties?.value, coordinates: (feature.geometry as Point).coordinates,
    }]));
    expect(zones).toEqual({
      11: { value: 10, coordinates: [0, 0] },
      12: { value: 99, coordinates: [150, 50] },
      13: { value: 30, coordinates: [200, 200] },
    });
  });

  it('updates by a property whose name holds quotes, and only the row it names', async () => {
    const key = `it's "loud"`;
    await db.setWorkspace('update_by_quoted_property');
    await db.loadGeojson({ outputTableName: 'zones', sourceCrs: 'EPSG:3395', geojsonObject: {
      type: 'FeatureCollection',
      features: [zone(11, 10, [0, 0], key), zone(12, 20, [100, 100], key), zone(13, 30, [200, 200], key)],
    } });
    await db.updateTable({ tableName: 'zones', strategy: 'update', idColumn: `properties.${key}`, data: {
      type: 'FeatureCollection', features: [zone(12, 99, [150, 50], key)],
    } });

    const features = (await db.getLayer('zones')).features;
    expect(features).toHaveLength(3);
    const zones = Object.fromEntries(features.map(feature => [feature.properties?.[key], {
      value: feature.properties?.value, coordinates: (feature.geometry as Point).coordinates,
    }]));
    expect(zones).toEqual({
      11: { value: 10, coordinates: [0, 0] },
      12: { value: 99, coordinates: [150, 50] },
      13: { value: 30, coordinates: [200, 200] },
    });
  });

  it.each([
    ['$id', 'update_by_dollar_property'],
    ['/p', 'update_by_slash_property'],
    ['zone\tid', 'update_by_tab_property'],
  ])('updates by a property named %j, read as a key and not as a JSON path', async (key, workspace) => {
    // A bare `$id` is a JSONPath to DuckDB and `/p` a JSON pointer, which reads the key `p`. Inside a quoted key DuckDB
    // decodes only `\"` and `\\`, so a key holding a tab has to reach it as it is.
    await db.setWorkspace(workspace);
    await db.loadGeojson({ outputTableName: 'zones', sourceCrs: 'EPSG:3395', geojsonObject: {
      type: 'FeatureCollection',
      features: [zone(11, 10, [0, 0], key), zone(12, 20, [100, 100], key), zone(13, 30, [200, 200], key)],
    } });
    await db.updateTable({ tableName: 'zones', strategy: 'update', idColumn: `properties.${key}`, data: {
      type: 'FeatureCollection', features: [zone(12, 99, [150, 50], key)],
    } });

    const features = (await db.getLayer('zones')).features;
    expect(features).toHaveLength(3);
    const zones = Object.fromEntries(features.map(feature => [feature.properties?.[key], {
      value: feature.properties?.value, coordinates: (feature.geometry as Point).coordinates,
    }]));
    expect(zones).toEqual({
      11: { value: 10, coordinates: [0, 0] },
      12: { value: 99, coordinates: [150, 50] },
      13: { value: 30, coordinates: [200, 200] },
    });
  });
});
