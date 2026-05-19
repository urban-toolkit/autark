/**
 * Generates a query that loads a polygonized feature collection into an output table.
 *
 * Extracts geometry and properties from GeoJSON features, creates the output table,
 * drops the intermediate feature collection table, and describes the result.
 * @param featureCollectionTableName The name of the intermediate feature collection table.
 * @param outputTableName The name for the final polygonized surface table.
 * @param workspace The workspace schema name.
 * @returns A SQL string that creates the output table, drops the temp feature collection, and describes it.
 * @example const sql = LOAD_POLYGONIZED_LAYER_QUERY('surface_feature_collection', 'surface', 'autk');
 */
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
