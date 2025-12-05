import { DEFAULT_GEO_COLUMN_NAME } from '../../../shared/consts';

export const LOAD_CSV_ON_TABLE_QUERY = (csvFileUrl: string, tableName: string, delimiter: string, workspace: string) => {
  const qualifiedTableName = `${workspace}.${tableName}`;
  return `
        CREATE OR REPLACE TABLE ${qualifiedTableName} AS
            SELECT * FROM READ_CSV(
                '${csvFileUrl}',
                delim='${delimiter}',
                HEADER=TRUE,
                AUTO_DETECT=TRUE
            );

        DESCRIBE ${qualifiedTableName};
  `;
};

interface LoadCsvOnTableWithCoordinatesParams {
  csvFileUrl: string;
  tableName: string;
  delimiter: string;
  latColumnName: string;
  longColumnName: string;
  coordinateFormat: string;
  workspace: string;
}
export const LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY = ({
  csvFileUrl,
  tableName,
  delimiter,
  latColumnName,
  longColumnName,
  coordinateFormat,
  workspace,
}: LoadCsvOnTableWithCoordinatesParams) => {
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
      FROM READ_CSV(
          '${csvFileUrl}',
          delim='${delimiter}',
          HEADER=TRUE,
          AUTO_DETECT=TRUE
      );

    DESCRIBE ${qualifiedTableName};
  `;
};
