import type { DbRecorderSet, DbTableLike } from './db-adapter-types';

function recordTableBySource(recorder: DbRecorderSet, table: DbTableLike): void {
  switch (table.source) {
    case 'csv':
      recorder.recordLoadCsv(table.name);
      return;
    case 'json':
      recorder.recordLoadJson(table.name);
      return;
    case 'osm':
      if (table.type === 'pointset') recorder.recordLoadOsm(table.name);
      else recorder.recordLoadLayer(table.name);
      return;
    case 'geojson':
      recorder.recordLoadCustomLayer(table.name);
      return;
    case 'user':
      if (table.type === 'pointset') recorder.recordRawQuery(`User table: ${table.name}`);
      else recorder.recordLoadGridLayer(table.name);
      return;
    default:
      recorder.recordRawQuery(`Table available: ${table.name}`);
  }
}

export function bootstrapDbRecorder(
  didBootstrap: { value: boolean },
  tables: DbTableLike[],
  recorder: DbRecorderSet
): void {
  if (didBootstrap.value) return;
  didBootstrap.value = true;
  recorder.recordInit();
  recorder.recordWorkspace(recorder.getWorkspaceSafe());
  for (const table of tables || []) {
    recordTableBySource(recorder, table);
  }
}
