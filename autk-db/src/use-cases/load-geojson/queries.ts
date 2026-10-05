import type { BoundingBox } from '@urban-toolkit/autk-core';

// Both readers consume the entire FeatureCollection as one JSON object.
const GEOJSON_MAXIMUM_OBJECT_SIZE = 100 * 1024 * 1024;

/** Finds a topologically invalid building before any target table is replaced. */
export const FIND_INVALID_BUILDING_GEOMETRY_QUERY = (fileName: string) => `
  SELECT feature->>'id' AS id
  FROM read_json('${fileName}', columns = {type: 'VARCHAR', features: 'JSON[]'}, maximum_object_size=${GEOJSON_MAXIMUM_OBJECT_SIZE}),
    UNNEST(features) AS t(feature)
  WHERE NOT ST_IsValid(ST_GeomFromGeoJSON(feature->'geometry'))
  LIMIT 1;
`;

/**
 * Creates a temporary DuckDB table from a GeoJSON file registered in the VFS.
 *
 * @param geojsonFileUrl - VFS path to the GeoJSON file (registered via `db.registerFileText`).
 * @param featureCollectionTableName - Name for the intermediate feature collection table.
 * @param workspace - Workspace (schema) where the temp table will be created.
 * @returns A SQL string that creates the intermediate feature collection table.
 * @example
 * const sql = LOAD_FEATURE_COLLECTION_QUERY('tmp.geojson', 'my_fc', 'autk');
 */
export const LOAD_FEATURE_COLLECTION_QUERY = (geojsonFileUrl: string, featureCollectionTableName: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${featureCollectionTableName}`;
  return `
    CREATE OR REPLACE TABLE ${qualifiedTableName} AS
    SELECT * FROM read_json('${geojsonFileUrl}', columns = {type: 'VARCHAR', features: 'JSON[]'}, maximum_object_size=${GEOJSON_MAXIMUM_OBJECT_SIZE});
  `;
};

/**
 * Generates SQL to transform a feature collection into a typed spatial layer table.
 *
 * The function optionally clips geometries to a bounding box, transforms CRS,
 * and writes a final table that is described at the end of the query.
 *
 * @param featureCollectionTableName - Intermediate feature collection table name.
 * @param outputTableName - Desired output layer table name.
 * @param sourceCrs - Input CRS of features.
 * @param targetCrs - Target CRS for the workspace.
 * @param workspace - Workspace (schema) name.
 * @param boundingBox - Optional spatial extent to clip/intersect geometries.
 * @returns SQL string that creates the output table from the feature collection and drops the intermediate table.
 * @example
 * const sql = LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY('my_fc', 'layer', 'EPSG:4326', 'EPSG:3857', 'autk');
 */
export const LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY = (
  featureCollectionTableName: string,
  outputTableName: string,
  sourceCrs: string,
  targetCrs: string,
  workspace: string,
  boundingBox?: BoundingBox,
  cropGeometry = true,
) => {
  const qualifiedFeatureCollectionTableName = `${workspace}.${featureCollectionTableName}`;
  const qualifiedOutputTableName = `${workspace}.${outputTableName}`;

  const geometryTransform = `ST_Transform(
    ST_GeomFromGeoJSON(feature->'geometry'),
    '${sourceCrs}',
    '${targetCrs}',
    always_xy := true
  )`;

  const geometrySelect = boundingBox && cropGeometry
    ? `ST_Intersection(
        ${geometryTransform},
        ST_MakeEnvelope(${boundingBox.minLon}, ${boundingBox.minLat}, ${boundingBox.maxLon}, ${boundingBox.maxLat})
      )`
    : geometryTransform;

  return `
    CREATE OR REPLACE TABLE ${qualifiedOutputTableName} AS
    SELECT
      row_number() OVER () AS id,
      feature->'id' AS geojson_id,
      ${geometrySelect} AS geometry,
      feature->'properties' AS properties
    FROM (
      SELECT UNNEST(features) AS feature
      FROM ${qualifiedFeatureCollectionTableName}
    )
    ${boundingBox ? 'WHERE ST_Intersects(' + geometryTransform + ', ST_MakeEnvelope(' + boundingBox.minLon + ', ' + boundingBox.minLat + ', ' + boundingBox.maxLon + ', ' + boundingBox.maxLat + '))' : ''};

    DROP TABLE ${qualifiedFeatureCollectionTableName};

    DESCRIBE ${qualifiedOutputTableName};
  `;
};
