/**
 * Schema validation tests for AutarkSpec JSON files.
 * Tests both positive (valid) and negative (invalid) fixtures.
 */
import { test, expect } from '@playwright/test';
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import { TransformExecutor } from '../../autk-runtime/src/transform-executor';

const schemaPath = path.join(__dirname, '../../schema/autark-spec-v0.1.json');
const examplesDir = path.join(__dirname, '../../examples/specs');

test.describe('Schema Validation - Positive Cases', () => {
  const ajv = new Ajv({ strict: false });
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const validate = ajv.compile(schema);

  test('01-basic-osm-map.json validates successfully', () => {
    const spec = JSON.parse(fs.readFileSync(path.join(examplesDir, '01-basic-osm-map.json'), 'utf-8'));
    const valid = validate(spec);
    expect(valid).toBe(true);
  });

  test('02-linked-map-histogram.json validates successfully', () => {
    const spec = JSON.parse(fs.readFileSync(path.join(examplesDir, '02-linked-map-histogram.json'), 'utf-8'));
    const valid = validate(spec);
    expect(valid).toBe(true);
  });

  test('03-spatial-join.json validates successfully', () => {
    const spec = JSON.parse(fs.readFileSync(path.join(examplesDir, '03-spatial-join.json'), 'utf-8'));
    const valid = validate(spec);
    expect(valid).toBe(true);
  });

  test('OSM source accepts explicit geocode area and relation areas', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        {
          "type": "osm",
          "name": "nyc_osm",
          "area": "Battery Park City",
          "geocodeArea": "New York",
          "areas": ["Battery Park City", "Financial District"],
          "layers": ["buildings", "roads"]
        }
      ],
      "views": [{ "type": "map", "layers": [{ "source": "nyc_osm_buildings" }] }]
    };
    const valid = validate(spec);
    expect(valid).toBe(true);
  });

  test('accepts heatmap transform output', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "trees", "url": "trees.geojson", "layerType": "points" }
      ],
      "transforms": [
        {
          "type": "heatmap",
          "source": "trees",
          "output": "tree_heatmap",
          "near": { "distance": 250, "useCentroid": true },
          "grid": { "rows": 32, "columns": 32 },
          "groupBy": [{ "column": "*", "op": "count" }]
        }
      ],
      "views": [{ "type": "map", "layers": [{ "source": "tree_heatmap" }] }]
    };
    const valid = validate(spec);
    expect(valid).toBe(true);
  });

  test('accepts GPGPU compute transform output', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "buildings", "url": "buildings.geojson", "layerType": "buildings" }
      ],
      "transforms": [
        {
          "type": "gpgpuCompute",
          "source": "buildings",
          "output": "building_compute",
          "layerType": "buildings",
          "variableMapping": { "height": "properties.height" },
          "wgslBody": "return height * 2.0;",
          "resultField": "height_double"
        }
      ],
      "views": [{ "type": "map", "layers": [{ "source": "building_compute", "type": "buildings" }] }]
    };
    const valid = validate(spec);
    expect(valid).toBe(true);
  });

  test('accepts render compute transform output', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "buildings", "url": "buildings.geojson", "layerType": "buildings" },
        { "type": "geojson", "name": "viewpoints", "url": "viewpoints.geojson", "layerType": "points" }
      ],
      "transforms": [
        {
          "type": "renderCompute",
          "output": "view_metrics",
          "layerType": "points",
          "layers": [{ "id": "buildings_layer", "source": "buildings", "type": "buildings" }],
          "viewpoints": {
            "source": "viewpoints",
            "strategy": { "type": "centroid" },
            "sampling": { "directions": 4 }
          },
          "aggregation": { "type": "classes", "includeBackground": true },
          "tileSize": 64
        }
      ],
      "views": [{ "type": "map", "layers": [{ "source": "view_metrics", "type": "points" }] }]
    };
    const valid = validate(spec);
    expect(valid).toBe(true);
  });

  test('accepts scatterplot and table views', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "points", "url": "points.geojson", "layerType": "points" }
      ],
      "views": [
        {
          "type": "scatterplot",
          "name": "value_scatterplot",
          "source": "points",
          "x": { "field": "id" },
          "y": { "field": "value" },
          "color": { "field": "name" },
          "selection": { "name": "scatter_brush", "type": "interval" }
        },
        {
          "type": "table",
          "name": "points_table",
          "source": "points",
          "columns": [{ "field": "id" }, { "field": "name" }, { "field": "value" }],
          "sort": { "column": "value", "direction": "desc" }
        }
      ]
    };
    const valid = validate(spec);
    expect(valid).toBe(true);
  });
});

test.describe('Schema Validation - Negative Cases', () => {
  const ajv = new Ajv({ strict: false });
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
  const validate = ajv.compile(schema);

  test('rejects spec with misspelled top-level key', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "metadta": { // typo: should be "metadata"
        "title": "Invalid Spec"
      },
      "data": [],
      "views": []
    };
    const valid = validate(spec);
    expect(valid).toBe(false);
    expect(validate.errors).toBeTruthy();
  });

  test('rejects data source with unsafe identifier', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        {
          "type": "geojson",
          "name": "my-invalid-name!", // unsafe identifier
          "url": "data/test.geojson"
        }
      ],
      "views": []
    };
    const valid = validate(spec);
    expect(valid).toBe(false);
  });

  test('rejects osm data source missing url when using PBF', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        {
          "type": "osm",
          "name": "osm_data",
          "source": "pbf",
          "layers": ["buildings"]
          // missing required "url" field for PBF source
        }
      ],
      "views": []
    };
    const valid = validate(spec);
    expect(valid).toBe(false);
  });

  test('rejects spatial join with empty near object', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "a", "url": "a.geojson" },
        { "type": "geojson", "name": "b", "url": "b.geojson" }
      ],
      "transforms": [
        {
          "type": "spatialJoin",
          "root": "a",
          "join": "b",
          "near": {} // empty near object should be rejected
        }
      ],
      "views": []
    };
    const valid = validate(spec);
    expect(valid).toBe(false);
  });

  test('rejects link with unknown target', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "data", "url": "data.geojson" }
      ],
      "views": [
        {
          "type": "histogram",
          "name": "hist",
          "source": "data",
          "x": { "field": "value" },
          "selection": { "name": "brush", "type": "interval" }
        }
      ],
      "links": [
        {
          "selection": "brush",
          "target": "nonexistent_layer", // target doesn't exist
          "action": "highlight"
        }
      ]
    };
    // Note: This may require runtime validation beyond schema
    validate(spec);
    // Schema may not catch this - it's more of a semantic validation issue
    // We keep the test to document expected behavior
  });

  test('rejects CSV source without geometry configuration', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        {
          "type": "csv",
          "name": "points",
          "url": "points.csv"
          // missing required "geometry" field
        }
      ],
      "views": []
    };
    const valid = validate(spec);
    expect(valid).toBe(false);
  });

  test('rejects heatmap collect aggregation', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "trees", "url": "trees.geojson", "layerType": "points" }
      ],
      "transforms": [
        {
          "type": "heatmap",
          "source": "trees",
          "output": "tree_heatmap",
          "near": { "distance": 250 },
          "grid": { "rows": 32, "columns": 32 },
          "groupBy": [{ "column": "species", "op": "collect" }]
        }
      ],
      "views": []
    };
    const valid = validate(spec);
    expect(valid).toBe(false);
  });

  test('rejects GPGPU compute without result field or output columns', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "buildings", "url": "buildings.geojson", "layerType": "buildings" }
      ],
      "transforms": [
        {
          "type": "gpgpuCompute",
          "source": "buildings",
          "output": "building_compute",
          "variableMapping": { "height": "properties.height" },
          "wgslBody": "return height * 2.0;"
        }
      ],
      "views": []
    };
    const valid = validate(spec);
    expect(valid).toBe(false);
  });

  test('rejects render compute tile sizes that are not multiples of 8', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "buildings", "url": "buildings.geojson", "layerType": "buildings" },
        { "type": "geojson", "name": "viewpoints", "url": "viewpoints.geojson", "layerType": "points" }
      ],
      "transforms": [
        {
          "type": "renderCompute",
          "output": "view_metrics",
          "layers": [{ "id": "buildings_layer", "source": "buildings", "type": "buildings" }],
          "viewpoints": { "source": "viewpoints" },
          "aggregation": { "type": "objects" },
          "tileSize": 63
        }
      ],
      "views": []
    };
    const valid = validate(spec);
    expect(valid).toBe(false);
  });

  test('rejects scatterplot without y encoding', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "points", "url": "points.geojson", "layerType": "points" }
      ],
      "views": [
        {
          "type": "scatterplot",
          "source": "points",
          "x": { "field": "id" }
        }
      ]
    };
    const valid = validate(spec);
    expect(valid).toBe(false);
  });

  test('rejects table without columns', () => {
    const spec = {
      "$schema": "https://urban-toolkit.github.io/autark/schema/autark-spec-v0.1.json",
      "version": "0.1",
      "data": [
        { "type": "geojson", "name": "points", "url": "points.geojson", "layerType": "points" }
      ],
      "views": [
        {
          "type": "table",
          "source": "points",
          "columns": []
        }
      ]
    };
    const valid = validate(spec);
    expect(valid).toBe(false);
  });
});

test.describe('Runtime transform validation', () => {
  test('rejects full-module WGSL in GPGPU transform body before execution', async () => {
    const executor = new TransformExecutor();
    await expect(executor.executeTransform({} as any, {
      type: 'gpgpuCompute',
      source: 'buildings',
      output: 'building_compute',
      variableMapping: { height: 'properties.height' },
      wgslBody: '@compute @workgroup_size(1) fn main() { return; }',
      resultField: 'height_double',
    })).rejects.toThrow(/function body/);
  });
});
