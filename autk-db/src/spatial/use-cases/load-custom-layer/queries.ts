import { BoundingBox } from '../../../shared/interfaces';

export const LOAD_FEATURE_COLLECTION_QUERY = (geojsonFileUrl: string, featureCollectionTableName: string) => {
  return `
    CREATE TABLE ${featureCollectionTableName} AS SELECT * FROM '${geojsonFileUrl}';
  `;
};

// TODO: update this name columns, its not linestring (i just do not want to break pattern right now)
export const LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY = (
  featureCollectionTableName: string,
  outputTableName: string,
  coordinateFormat: string,
  boundingBox?: BoundingBox,
) => {
  const geometryTransform = `ST_Transform(
    ST_GeomFromGeoJSON(JSON(feature.geometry)),
    'EPSG:4326',
    '${coordinateFormat}',
    always_xy := true
  )`;

  const geometrySelect = boundingBox
    ? `ST_Intersection(
        ${geometryTransform},
        ST_MakeEnvelope(${boundingBox.minLon}, ${boundingBox.minLat}, ${boundingBox.maxLon}, ${boundingBox.maxLat})
      )`
    : geometryTransform;

  return `
    CREATE TABLE ${outputTableName} AS
    SELECT
      ${geometrySelect} AS geometry,
      feature.properties AS properties
    FROM (
      SELECT UNNEST(features) AS feature
      FROM ${featureCollectionTableName}
    )
    ${boundingBox ? 'WHERE ST_Intersects(' + geometryTransform + ', ST_MakeEnvelope(' + boundingBox.minLon + ', ' + boundingBox.minLat + ', ' + boundingBox.maxLon + ', ' + boundingBox.maxLat + '))' : ''};

    DROP TABLE ${featureCollectionTableName};

    DESCRIBE ${outputTableName};
  `;
};
