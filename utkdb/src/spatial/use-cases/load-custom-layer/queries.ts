import { Column } from '../../../shared/interfaces';

export const LOAD_FEATURE_COLLECTION_QUERY = (geojsonFileUrl: string, featureCollectionTableName: string) => {
  return `
    CREATE TABLE ${featureCollectionTableName} AS SELECT * FROM ST_Read('${geojsonFileUrl}');

    DESCRIBE ${featureCollectionTableName};
  `;
};

// TODO: update this name columns, its not linestring (i just do not want to break pattern right now)
export const LOAD_LAYER_FROM_FEATURE_COLLECTION_QUERY = (
  featureCollectionTableName: string,
  outputTableName: string,
  columns: Column[],
  coordinateFormat: string,
) => {
  const geoColumn = columns.find((col) => col.type === 'GEOMETRY');
  if (!geoColumn) {
    throw new Error("Could not find geometry column in feature collection's");
  }

  const nonGeoColumns = columns.filter((col) => col !== geoColumn);

  return `
    CREATE TABLE ${outputTableName} AS
    SELECT
      ST_Transform(
        ${geoColumn.name},
        'EPSG:4326',
        '${coordinateFormat}',
        always_xy := true
      ) AS geometry,
      CAST(json_object(${nonGeoColumns.map((col) => `'${col.name}', ${col.name}`).join(', ')}) AS JSON) AS properties
    FROM ${featureCollectionTableName};

    DROP TABLE ${featureCollectionTableName};

    DESCRIBE ${outputTableName};
  `;
};
