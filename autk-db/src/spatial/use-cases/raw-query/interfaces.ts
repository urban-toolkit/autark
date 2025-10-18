export type RawQueryOutput = Record<string, unknown>[];

export interface RawQueryParams {
  query: string;
  output: {
    type: 'CREATE_TABLE' | 'RETURN_OBJECT';
    /* If type is 'CREATE_TABLE', tableName must be provided */
    tableName?: string;
    /** Optional: identify the origin/source of this new table */
    source?: 'csv' | 'osm' | 'osm_layer' | 'geojson' | 'user';
  };
}
