import type { AutarkProvenanceState } from '../../types';
import type { IDbForProvenance } from './types';
import { getWorkspaceSafe } from './utils';

export async function applyDbState(
  db: IDbForProvenance,
  state: AutarkProvenanceState,
  setApplyingState: (value: boolean) => void
): Promise<void> {
  if (!state.data?.workspace || getWorkspaceSafe(db) === state.data.workspace) return;
  setApplyingState(true);
  try {
    await db.setWorkspace(state.data.workspace);
  } finally {
    setApplyingState(false);
  }
}
