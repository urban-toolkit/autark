import { Column } from '../../shared/interfaces';

type DuckDbTableDescriptionColumn = {
  column_name: string;
  column_type: string;
};

/**
 * Converts DuckDB `DESCRIBE` output rows into `Column` metadata objects.
 *
 * @param tableDescribeResponse Array of `{ column_name, column_type }` rows from DuckDB.
 * @returns Array of `{ name, type }` column descriptors.
 * @throws Never throws.
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
 * Recursively converts values returned by DuckDB-Wasm / Apache Arrow into
 * plain JavaScript values so they can be safely logged or serialised. It
 * handles nested arrays, structs and any object exposing a `toJSON()` method.
 */
export function toPlain<T = unknown>(value: T): T {
  // Primitives (string, number, boolean, undefined, null, bigint, symbol)
  if (value === null || typeof value !== 'object') {
    // Arrow sometimes encodes primitive strings as a JSON string literal, e.g.
    //   value === '"secondary"'
    // Detect that pattern and decode it.
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

  // Arrow/DuckDB objects usually implement toJSON() to expose their contents.
  const maybeJsonifiable = value as unknown as { toJSON?: () => unknown };
  if (typeof maybeJsonifiable.toJSON === 'function') {
    // Recurse after conversion to remove any nested wrappers.
    return toPlain(maybeJsonifiable.toJSON()) as T;
  }

  // Arrays – normalise every element.
  if (Array.isArray(value)) {
    return value.map((v) => toPlain(v)) as unknown as T;
  }

  // Generic object – normalise each property.
  const plainObj = Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toPlain(v)]),
  );
  return plainObj as T;
}
