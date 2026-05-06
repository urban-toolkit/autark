import type { MapViewState } from '../../types';

export function selectionSignature(selection: number[]): string {
  return selection.join(',');
}

export function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function viewsEqual(a: MapViewState | undefined, b: MapViewState | undefined, epsilon = 1e-6): boolean {
  if (!a || !b) return a === b;
  return vectorsEqual(a.eye, b.eye, epsilon)
    && vectorsEqual(a.lookAt, b.lookAt, epsilon)
    && vectorsEqual(a.up, b.up, epsilon);
}

function vectorsEqual(a: number[], b: number[], epsilon: number): boolean {
  return a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) <= epsilon);
}
