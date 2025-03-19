export const LOAD_QUERY_QUERY = (query: string, outputTableName: string) => {
  return `
        CREATE TABLE ${outputTableName} AS ${query};

        DESCRIBE ${outputTableName};
    `;
};
