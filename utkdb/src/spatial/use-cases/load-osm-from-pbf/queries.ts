export const LOAD_PBF_ON_TABLE_QUERY = (pbfFileUrl: string, tableName: string) => {
  return `
        CREATE TABLE ${tableName} AS
            SELECT * FROM ST_READOSM('${pbfFileUrl}');

        DESCRIBE ${tableName};
  `;
};
