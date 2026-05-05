import type { DbRecordCallback } from './db-adapter-types';
import { createDbAdapter, type IDbForProvenance } from './db-adapter';

export function createDbProvenanceWrapper<T extends IDbForProvenance>(
  db: T,
  onRecord: DbRecordCallback
): T {
  const adapter = createDbAdapter(db, onRecord);
  adapter.startRecording();
  return db;
}
