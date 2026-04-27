import type { AutarkProvenanceState } from '../types';
import { ProvenanceAction } from '../types';

export type ComputeRecordCallback = (
  actionType: ProvenanceAction | string,
  actionLabel: string,
  stateDelta: Partial<AutarkProvenanceState>
) => void;

/**
 * Minimal interface for a compute object compatible with autk-compute's GeojsonCompute.
 * Only the methods that exist on the instance are wrapped — missing methods are ignored.
 */
export interface IComputeForProvenance {
  computeFunctionIntoProperties?(...args: unknown[]): Promise<unknown>;
  [key: string]: unknown;
}

export interface ComputeAdapterApi {
  startRecording(): void;
  stopRecording(): void;
}

function isFn(value: unknown): value is (...args: unknown[]) => Promise<unknown> {
  return typeof value === 'function';
}

function extractOutputColumnName(args: unknown[]): string {
  const params = args[0];
  if (params && typeof params === 'object' && 'outputColumnName' in params) {
    const name = (params as { outputColumnName?: unknown }).outputColumnName;
    if (typeof name === 'string' && name.trim().length > 0) return name;
  }
  return 'result';
}

function extractFeatureCount(args: unknown[]): number {
  const params = args[0];
  if (params && typeof params === 'object' && 'geojson' in params) {
    const geojson = (params as { geojson?: unknown }).geojson;
    if (geojson && typeof geojson === 'object' && 'features' in geojson) {
      const features = (geojson as { features?: unknown[] }).features;
      if (Array.isArray(features)) return features.length;
    }
  }
  return 0;
}

export function createComputeAdapter(
  compute: IComputeForProvenance,
  onRecord: ComputeRecordCallback
): ComputeAdapterApi {
  const computeObj = compute as Record<string, unknown>;
  const originalMethods = new Map<string, unknown>();
  let isRecording = false;

  function wrapAsyncMethod(
    methodName: string,
    buildRecord: (args: unknown[]) => { label: string; delta: Partial<AutarkProvenanceState> }
  ): void {
    const current = computeObj[methodName];
    if (!isFn(current) || originalMethods.has(methodName)) return;
    originalMethods.set(methodName, current);

    computeObj[methodName] = async function (...args: unknown[]) {
      const result = await (current as (...a: unknown[]) => Promise<unknown>).apply(this, args);
      if (isRecording) {
        const { label, delta } = buildRecord(args);
        onRecord(ProvenanceAction.COMPUTE_RUN, label, delta);
      }
      return result;
    };
  }

  function restoreWrappedMethods(): void {
    for (const [methodName, original] of originalMethods.entries()) {
      computeObj[methodName] = original;
    }
    originalMethods.clear();
  }

  function startRecording(): void {
    if (isRecording) return;
    isRecording = true;

    wrapAsyncMethod('computeFunctionIntoProperties', (args) => {
      const col = extractOutputColumnName(args);
      const n = extractFeatureCount(args);
      return {
        label: `Compute: "${col}" on ${n} feature${n !== 1 ? 's' : ''}`,
        delta: {
          filters: {
            lastCompute: { outputColumnName: col, featureCount: n, timestamp: Date.now() },
          },
        },
      };
    });
  }

  function stopRecording(): void {
    if (!isRecording) return;
    isRecording = false;
    restoreWrappedMethods();
  }

  return { startRecording, stopRecording };
}
