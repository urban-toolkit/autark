export const LOAD_POLYGONIZED_LAYER_QUERY = (
    featureCollectionTableName: string,
    outputTableName: string,
    workspace: string,
) => {
    const qualifiedFeatureCollectionTableName = `${workspace}.${featureCollectionTableName}`;
    const qualifiedOutputTableName = `${workspace}.${outputTableName}`;
    
    return `
    CREATE OR REPLACE TABLE ${qualifiedOutputTableName} AS
    SELECT
      ST_GeomFromGeoJSON(JSON(feature.geometry)) AS geometry,
      feature.properties AS properties
    FROM (
      SELECT UNNEST(features) AS feature
      FROM ${qualifiedFeatureCollectionTableName}
    );

    DROP TABLE ${qualifiedFeatureCollectionTableName};

    DESCRIBE ${qualifiedOutputTableName};
  `;
};

