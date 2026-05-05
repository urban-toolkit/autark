import type { IDbForProvenance } from './types';

export function inferName(result: unknown, fallback = 'table'): string {
  if (result && typeof result === 'object' && 'name' in result) {
    const maybeName = (result as { name?: unknown }).name;
    if (typeof maybeName === 'string' && maybeName.trim().length > 0) return maybeName;
  }
  return fallback;
}

export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

export function getCurrentLayerNames(db: IDbForProvenance): string[] {
  return (db.tables || []).map((table) => table.name);
}

export function getWorkspaceSafe(db: IDbForProvenance): string {
  try {
    return db.getCurrentWorkspace();
  } catch {
    return 'main';
  }
}

export function appendLayerName(names: string[], tableName: string): string[] {
  return names.includes(tableName) ? names : [...names, tableName];
}
