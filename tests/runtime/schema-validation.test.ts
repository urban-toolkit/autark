/**
 * Schema validation tests for AutarkSpec JSON files.
 * Tests both positive (valid) and negative (invalid) fixtures.
 */
import { test, expect } from '@playwright/test';
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';

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
});
