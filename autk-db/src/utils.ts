import { Column } from './interfaces';

/**
 * Internal shape of one row returned by DuckDB `DESCRIBE` queries.
 *
 * Mirrors DuckDB column metadata before it is normalized to the public `Column` format.
 */
type DuckDbTableDescriptionColumn = {
  /** Raw DuckDB column name field. */
  column_name: string;
  /** Raw DuckDB column type field. */
  column_type: string;
};

/**
 * Converts DuckDB `DESCRIBE` rows into public `Column` metadata.
 *
 * Keeps the schema shape stable for callers that consume table definitions.
 *
 * @param tableDescribeResponse - Array of `{ column_name, column_type }` rows from DuckDB.
 * @returns Array of normalized `{ name, type }` column descriptors.
 * @throws Never throws.
 * @example
 * const columns = getColumnsFromDuckDbTableDescribe([
 *   { column_name: 'height', column_type: 'DOUBLE' },
 * ]);
 * console.log(columns[0]); // { name: 'height', type: 'DOUBLE' }
 */
export function getColumnsFromDuckDbTableDescribe(
  tableDescribeResponse: Array<DuckDbTableDescriptionColumn>,
): Array<Column> {
  return tableDescribeResponse.map((column: DuckDbTableDescriptionColumn) => {
    return {
      name: column.column_name,
      type: column.column_type,
    };
  });
}

/**
 * Converts DuckDB-Wasm and Arrow values into plain JavaScript data.
 *
 * Recurses through arrays, objects, and `toJSON()` wrappers so results can be safely logged or serialized.
 *
 * @param value - Value returned by DuckDB-Wasm or Apache Arrow.
 * @returns A plain JavaScript representation of `value` with nested wrappers removed.
 * @throws Never throws. Invalid JSON-like strings are returned unchanged.
 * @example
 * const value = toPlain({
 *   toJSON: () => ({ tags: ['"secondary"', 2] }),
 * });
 * console.log(value); // { tags: ['secondary', 2] }
 */
export function toPlain<T = unknown>(value: T): T {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
        try {
          return JSON.parse(trimmed) as unknown as T;
        } catch {
          /* ignore parse errors and fall through */
        }
      }
    }
    return value;
  }

  const maybeJsonifiable = value as unknown as { toJSON?: () => unknown };
  if (typeof maybeJsonifiable.toJSON === 'function') {
    return toPlain(maybeJsonifiable.toJSON()) as T;
  }

  if (Array.isArray(value)) {
    return value.map((v) => toPlain(v)) as unknown as T;
  }

  const plainObj = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toPlain(v)]),
  );
  return plainObj as T;
}
