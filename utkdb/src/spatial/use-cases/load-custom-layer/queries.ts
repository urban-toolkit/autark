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
) => {
  return `
    CREATE TABLE ${outputTableName} AS
    SELECT
      ST_Transform(
        ST_GeomFromGeoJSON(JSON(feature.geometry)),
        'EPSG:4326',
        '${coordinateFormat}',
        always_xy := true
      ) AS geometry,
      feature.properties AS properties
    FROM (
      SELECT UNNEST(features) AS feature
      FROM ${featureCollectionTableName}
    );

    DROP TABLE ${featureCollectionTableName};

    DESCRIBE ${outputTableName};
  `;
};
