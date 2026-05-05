import type { AutarkProvenanceState } from './types';
import { ProvenanceAction } from './types';
import type { ProvenanceCoreApi } from './core/api';
import { createProvenanceCoreStore } from './core/store';
import { mergeAutarkProvenanceState } from './core/state';

export type { ProvenanceCoreApi } from './core/api';

export interface ProvenanceCoreOptions {
  initialState: AutarkProvenanceState;
}

export interface ProvenanceCoreGenericOptions<T> {
  initialState: T;
  mergeState: (base: T, delta: Partial<T>) => T;
}

export function createProvenanceCore(
  options: ProvenanceCoreOptions
): ProvenanceCoreApi<AutarkProvenanceState> {
  return createProvenanceCoreStore({
    initialState: options.initialState,
    mergeState: mergeAutarkProvenanceState,
    rootActionType: ProvenanceAction.ROOT,
  });
}

export function createProvenanceCoreGeneric<T extends Record<string, unknown>>(
  options: ProvenanceCoreGenericOptions<T>
): ProvenanceCoreApi<T> {
  return createProvenanceCoreStore({ ...options, rootActionType: ProvenanceAction.ROOT });
}
