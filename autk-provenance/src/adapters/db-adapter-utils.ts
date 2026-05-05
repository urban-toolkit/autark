export function inferName(result: unknown, fallback = 'table'): string {
  if (result && typeof result === 'object' && 'name' in result) {
    const maybeName = (result as { name?: unknown }).name;
    if (typeof maybeName === 'string' && maybeName.trim().length > 0) return maybeName;
  }
  return fallback;
}

export function isFn(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}
