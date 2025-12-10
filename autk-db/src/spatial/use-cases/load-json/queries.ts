import { DEFAULT_GEO_COLUMN_NAME } from '../../../shared/consts';

export const LOAD_JSON_ON_TABLE_QUERY = (jsonFileUrl: string, tableName: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
        CREATE OR REPLACE TABLE ${qualifiedTableName} AS
            SELECT * FROM read_json_auto('${jsonFileUrl}');

        DESCRIBE ${qualifiedTableName};
  `;
};

interface LoadJsonOnTableWithCoordinatesParams {
  jsonFileUrl: string;
  tableName: string;
  latColumnName: string;
  longColumnName: string;
  coordinateFormat: string;
  workspace: string;
}
export const LOAD_JSON_ON_TABLE_WITH_COORDINATES_QUERY = ({
  jsonFileUrl,
  tableName,
  latColumnName,
  longColumnName,
  coordinateFormat,
  workspace,
}: LoadJsonOnTableWithCoordinatesParams) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
    CREATE TABLE ${qualifiedTableName} AS
      SELECT
          *,
          ST_Transform(
              ST_Point(CAST(${longColumnName} AS DOUBLE), CAST(${latColumnName} AS DOUBLE)),
              'EPSG:4326',
              '${coordinateFormat}',
              always_xy := true
          ) AS ${DEFAULT_GEO_COLUMN_NAME}
      FROM read_json_auto('${jsonFileUrl}');

    DESCRIBE ${qualifiedTableName};
  `;
};
