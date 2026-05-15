import type { BoundingBox } from '../../types-core';

export const LOAD_FEATURE_COLLECTION_QUERY = (geojsonFileUrl: string, featureCollectionTableName: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${featureCollectionTableName}`;
  return `
    CREATE OR REPLACE TABLE ${qualifiedTableName} AS
    SELECT * FROM read_json('${geojsonFileUrl}', maximum_object_size=104857600);
  `;
};

export const LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY = (
  featureCollectionTableName: string,
  outputTableName: string,
  sourceCrs: string,
  targetCrs: string,
  workspace: string,
  boundingBox?: BoundingBox,
) => {
  const qualifiedFeatureCollectionTableName = `${workspace}.${featureCollectionTableName}`;
  const qualifiedOutputTableName = `${workspace}.${outputTableName}`;

  const geometryTransform = `ST_Transform(
    ST_GeomFromGeoJSON(JSON(feature.geometry)),
    '${sourceCrs}',
    '${targetCrs}',
    always_xy := true
  )`;

  const geometrySelect = boundingBox
    ? `ST_Intersection(
        ${geometryTransform},
        ST_MakeEnvelope(${boundingBox.minLon}, ${boundingBox.minLat}, ${boundingBox.maxLon}, ${boundingBox.maxLat})
      )`
    : geometryTransform;

  return `
    CREATE OR REPLACE TABLE ${qualifiedOutputTableName} AS
    SELECT
      row_number() OVER () AS id,
      ${geometrySelect} AS geometry,
      feature.properties AS properties
    FROM (
      SELECT UNNEST(features) AS feature
      FROM ${qualifiedFeatureCollectionTableName}
    )
    ${boundingBox ? 'WHERE ST_Intersects(' + geometryTransform + ', ST_MakeEnvelope(' + boundingBox.minLon + ', ' + boundingBox.minLat + ', ' + boundingBox.maxLon + ', ' + boundingBox.maxLat + '))' : ''};

    DROP TABLE ${qualifiedFeatureCollectionTableName};

    DESCRIBE ${qualifiedOutputTableName};
  `;
};
