export const LOAD_POLYGONIZED_LAYER_QUERY = (
    featureCollectionTableName: string,
    outputTableName: string,
) => {
    return `
    CREATE OR REPLACE TABLE ${outputTableName} AS
    SELECT
      ST_GeomFromGeoJSON(JSON(feature.geometry)) AS geometry,
      feature.properties AS properties
    FROM (
      SELECT UNNEST(features) AS feature
      FROM ${featureCollectionTableName}
    );

    DROP TABLE ${featureCollectionTableName};

    DESCRIBE ${outputTableName};
  `;
};

