import { DEFAULT_GEO_COLUMN_NAME } from '../../../shared/consts';

export const LOAD_CSV_ON_TABLE_QUERY = (csvFileUrl: string, tableName: string, delimiter: string) => {
  return `
        CREATE OR REPLACE TABLE ${tableName} AS
            SELECT * FROM READ_CSV(
                '${csvFileUrl}',
                delim='${delimiter}',
                HEADER=TRUE,
                AUTO_DETECT=TRUE
            );

        DESCRIBE ${tableName};
  `;
};

interface LoadCsvOnTableWithCoordinatesParams {
  csvFileUrl: string;
  tableName: string;
  delimiter: string;
  latColumnName: string;
  longColumnName: string;
  coordinateFormat: string;
}
export const LOAD_CSV_ON_TABLE_WITH_COORDINATES_QUERY = ({
  csvFileUrl,
  tableName,
  delimiter,
  latColumnName,
  longColumnName,
  coordinateFormat,
}: LoadCsvOnTableWithCoordinatesParams) => {
  return `
    CREATE TABLE ${tableName} AS
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

    DESCRIBE ${tableName};
  `;
};
