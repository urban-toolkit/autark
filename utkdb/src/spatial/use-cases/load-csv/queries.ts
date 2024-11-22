export const LOAD_CSV_ON_TABLE_QUERY = (csvFileUrl: string, tableName: string, delimiter: string) => {
  return `
        CREATE TABLE ${tableName} AS
            SELECT * FROM READ_CSV(
                '${csvFileUrl}',
                delim='${delimiter}',
                HEADER=TRUE,
                AUTO_DETECT=TRUE
            );

        DESCRIBE ${tableName};
  `;
};
