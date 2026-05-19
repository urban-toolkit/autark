import { Table } from '../../interfaces';

/** Column specification for group-by aggregation within the query builder. */
type InternalColumn = { column: string; aggregateFn?: string; normalize?: boolean };

/** Internal parameters passed to the SQL query builder. */
interface Params {
  /** Workspace namespace qualifying table names. */
  workspace: string;
  /** Root table metadata. */
  tableRoot: Table;
  /** Join table metadata. */
  tableJoin: Table;
  /** Geometry column name in the root table. */
  geometricColumnRoot: string;
  /** Geometry column name in the join table. */
  geometricColumnJoin: string;
  /** Spatial predicate: `'INTERSECT'` or `'NEAR'`. */
  spatialPredicate: string;
  /** Maximum distance for the `'NEAR'` predicate. */
  nearDistance?: number;
  /** When `true`, uses centroid-to-centroid distance for `'NEAR'`. */
  nearUseCentroid?: boolean;
  /** Columns to aggregate, or `null` for no aggregation. */
  groupBy: Array<InternalColumn> | null;
}

/** CTE alias used when the NEAR predicate pre-filters join candidates. */
const NEAR_CTE_ALIAS = 'csv_candidates';

/**
 * Qualifies a table name with its workspace namespace.
 *
 * @param workspace - workspace namespace.
 * @param tableName - unqualified table name.
 * @returns fully-qualified table name (`workspace.tableName`).
 */
const getQualifiedTableName = (workspace: string, tableName: string) => `${workspace}.${tableName}`;

/**
 * Builds the complete SQL query for a spatial join between two tables.
 *
 * Generates SELECT, JOIN, optional GROUP BY, and optional normalization window functions. For the `'NEAR'` predicate, a CTE pre-filters join candidates using bounding box expansion.
 *
 * @param params - query configuration including tables, geometry columns, predicate, and optional aggregation.
 * @returns SQL string that produces the joined result set.
 * @throws No runtime errors — returns a pure SQL string.
 * @example
 * const sql = SPATIAL_JOIN_QUERY({ workspace: 'main', tableRoot, tableJoin, geometricColumnRoot: 'geometry', geometricColumnJoin: 'geometry', spatialPredicate: 'INTERSECT', groupBy: null });
 */
export const SPATIAL_JOIN_QUERY = (params: Params) => {
  const isNear = params.spatialPredicate === 'NEAR';
  const qualifiedTableRootName = getQualifiedTableName(params.workspace, params.tableRoot.name);
  const qualifiedTableJoinName = getQualifiedTableName(params.workspace, params.tableJoin.name);

  // For NEAR, wrap the join table in a CTE for pre-filtering
  const effectiveJoinTable: Table = isNear
    ? { ...params.tableJoin, name: NEAR_CTE_ALIAS }
    : params.tableJoin;

  const selectString = getSelectString({
    tableRoot: params.tableRoot,
    tableJoin: effectiveJoinTable,
    tableJoinNameForKeys: params.tableJoin.name,
    geometricColumnRoot: params.geometricColumnRoot,
    geometricColumnJoin: params.geometricColumnJoin,
    nearUseCentroid: params.nearUseCentroid,
    groupBy: params.groupBy,
  });

  const joinString = getJoinString({
    spatialPredicate: params.spatialPredicate,
    qualifiedTableJoinName,
    tableJoin: effectiveJoinTable,
    tableRoot: params.tableRoot,
    geometricColumnRoot: params.geometricColumnRoot,
    geometricColumnJoin: params.geometricColumnJoin,
    nearDistance: params.nearDistance,
    nearUseCentroid: params.nearUseCentroid,
  });

  const groupByString = getGroupByString(params.tableRoot);

  const rootGeomExpr = (tableAlias: string, col: string) =>
    params.nearUseCentroid ? `ST_Centroid(${tableAlias}.${quoteIdentifier(col)})` : `${tableAlias}.${quoteIdentifier(col)}`;

  const nearCtePart = isNear
    ? `${NEAR_CTE_ALIAS} AS (
        SELECT * FROM ${qualifiedTableJoinName} AS ${params.tableJoin.name}
        WHERE ST_Intersects(
          (SELECT ST_Union_Agg(ST_Expand(${rootGeomExpr(params.tableRoot.name, params.geometricColumnRoot)}, ${params.nearDistance})) FROM ${qualifiedTableRootName} AS ${params.tableRoot.name}),
          ${params.tableJoin.name}.${quoteIdentifier(params.geometricColumnJoin)}
        )
      )`
    : null;

  const innerQuery = `
    ${selectString}
    FROM ${qualifiedTableRootName} AS ${params.tableRoot.name}
    ${joinString}
    ${params.groupBy ? groupByString : ''}
  `;

  const normalizedColumns = params.groupBy?.filter((col) => col.normalize) ?? [];

  if (normalizedColumns.length > 0) {
    const cteParts = [...(nearCtePart ? [nearCtePart] : []), `sjoin_base AS (${innerQuery})`];
    const normPatch = buildNormalizationMergePatch(normalizedColumns, params.tableJoin.name);
    return `
      WITH ${cteParts.join(',\n')}
      SELECT * REPLACE (${normPatch} AS properties)
      FROM sjoin_base;
    `;
  }

  return `
    ${nearCtePart ? `WITH ${nearCtePart}` : ''}
    ${innerQuery};
  `;
};

/**
 * Builds the SELECT clause for the spatial join.
 *
 * With `groupBy`, produces merged properties containing aggregated sjoin data. Without `groupBy`, produces a simple join with properties from both tables.
 *
 * @param params - context including tables, geometry columns, and optional aggregation.
 * @returns SQL SELECT clause string.
 * @throws No runtime errors.
 */
function getSelectString(params: {
  tableRoot: Table;
  tableJoin: Table;
  /** Original join table name, used for JSON key generation when the SQL alias differs. */
  tableJoinNameForKeys: string;
  geometricColumnRoot: string;
  geometricColumnJoin: string;
  nearUseCentroid?: boolean;
  groupBy: Array<InternalColumn> | null;
}) {
  if (params.groupBy) {
    const { aggregatesByFunction, nonAggregateColumns } = groupColumnsByAggregateFunction(params.groupBy);
    const sjoinObjectSql = buildSjoinObject(aggregatesByFunction, nonAggregateColumns, {
      tableJoin: params.tableJoin,
      tableJoinNameForKeys: params.tableJoinNameForKeys,
      geometricColumnRoot: params.geometricColumnRoot,
      geometricColumnJoin: params.geometricColumnJoin,
      nearUseCentroid: params.nearUseCentroid,
      tableRoot: params.tableRoot,
    });

    const additionalColumns = getAdditionalRootColumns(params.tableRoot);
    const additionalColumnsStr =
      additionalColumns.length > 0 ? `,\n        ${additionalColumns.join(',\n        ')}` : '';

    return `
      SELECT 
        ${params.tableRoot.name}.geometry,
        json_merge_patch(
          ${buildPropertiesObjectExpression(params.tableRoot)},
          json_object(
            'sjoin', json_object(
              ${sjoinObjectSql}
            )
          )
        ) AS properties${additionalColumnsStr}
    `;
  }

  return buildSimpleJoinSelect(params.tableRoot, params.tableJoin, params.geometricColumnJoin);
}

/**
 * Partitions group-by columns into aggregate functions and plain columns.
 *
 * @param selectColumns - list of columns with optional aggregate functions.
 * @returns object with `aggregatesByFunction` (grouped by function name) and `nonAggregateColumns`.
 * @throws No runtime errors.
 */
function groupColumnsByAggregateFunction(selectColumns: Array<InternalColumn>) {
  const aggregatesByFunction: Record<
    string,
    Array<{ column: string; aggregateFnResultColumnName?: string }>
  > = {};
  const nonAggregateColumns: Array<{ column: string }> = [];

  selectColumns.forEach((column) => {
    if (column.aggregateFn) {
      const funcName = column.aggregateFn.toLowerCase();
      if (!aggregatesByFunction[funcName]) {
        aggregatesByFunction[funcName] = [];
      }
      aggregatesByFunction[funcName].push({
        column: column.column,
      });
    } else {
      nonAggregateColumns.push({
        column: column.column,
      });
    }
  });

  return { aggregatesByFunction, nonAggregateColumns };
}

/**
 * Builds the `sjoin` JSON object expression from aggregated and non-aggregated columns.
 *
 * Dispatches to specialized builders for `count`, `weighted`, `collect`, and other aggregate functions.
 *
 * @param aggregatesByFunction - columns grouped by aggregate function name.
 * @param nonAggregateColumns - columns without aggregation.
 * @param geomContext - geometry and table context for distance-based expressions.
 * @returns SQL fragment for the `json_object('sjoin', ...)` call.
 * @throws No runtime errors.
 */
function buildSjoinObject(
  aggregatesByFunction: Record<string, Array<{ column: string }>>,
  nonAggregateColumns: Array<{ column: string }>,
  geomContext: { tableRoot: Table; tableJoin: Table; tableJoinNameForKeys: string; geometricColumnRoot: string; geometricColumnJoin: string; nearUseCentroid?: boolean },
): string {
  const sjoinParts: string[] = [];

  Object.entries(aggregatesByFunction).forEach(([funcName, columns]) => {
    if (funcName === 'count') {
      sjoinParts.push(buildCountExpression(columns[0], geomContext.tableJoinNameForKeys));
    } else if (funcName === 'weighted') {
      sjoinParts.push(buildWeightedExpression(columns[0], geomContext));
    } else if (funcName === 'collect') {
      sjoinParts.push(buildCollectExpression(columns[0], geomContext.tableJoin, geomContext.tableJoinNameForKeys));
    } else {
      sjoinParts.push(buildNestedFunctionExpression(funcName, columns, geomContext.tableJoin, geomContext.tableJoinNameForKeys));
    }
  });

  if (nonAggregateColumns.length > 0) {
    sjoinParts.push(buildNonAggregateColumns(nonAggregateColumns, geomContext.tableJoin));
  }

  return sjoinParts.join(', ');
}

/**
 * Builds the distance-weighted aggregation SQL expression.
 *
 * Computes `SUM(1.0 / (distance + 1.0))` using the root and join geometries.
 *
 * @param _column - unused column spec (weighted is row-level, not column-level).
 * @param geomContext - geometry context including CRS and centroid settings.
 * @returns SQL fragment for the `'weighted'` JSON key.
 * @throws No runtime errors.
 */
function buildWeightedExpression(
  _column: { column: string },
  geomContext: { tableRoot: Table; tableJoin: Table; tableJoinNameForKeys: string; geometricColumnRoot: string; geometricColumnJoin: string; nearUseCentroid?: boolean },
): string {
  const { tableRoot, tableJoin, geometricColumnRoot, geometricColumnJoin, nearUseCentroid, tableJoinNameForKeys } = geomContext;
  const rootGeom = nearUseCentroid
    ? `ST_Centroid(${tableRoot.name}.${quoteIdentifier(geometricColumnRoot)})`
    : `${tableRoot.name}.${quoteIdentifier(geometricColumnRoot)}`;
  const joinGeom = nearUseCentroid
    ? `ST_Centroid(${tableJoin.name}.${quoteIdentifier(geometricColumnJoin)})`
    : `${tableJoin.name}.${quoteIdentifier(geometricColumnJoin)}`;
  return `'weighted', json_object('${escapeSqlString(tableJoinNameForKeys)}', SUM(1.0 / (ST_Distance(${rootGeom}, ${joinGeom}) + 1.0)))`;
}

/**
 * Builds the collect aggregation SQL expression.
 *
 * Groups join-side rows into a JSON array.
 *
 * @param column - the column spec containing the column name.
 * @param tableJoin - join table metadata for value expression generation.
 * @param tableJoinNameForKeys - original join table name used for the JSON key.
 * @returns SQL fragment for the `'collect'` JSON key.
 * @throws No runtime errors.
 */
function buildCollectExpression(column: { column: string }, tableJoin: Table, tableJoinNameForKeys: string): string {
  const valueExpression = generateValueExpression(tableJoin, column.column, 'COLLECT');
  return `'collect', json_object('${escapeSqlString(tableJoinNameForKeys)}', ${valueExpression})`;
}

/**
 * Builds the count aggregation SQL expression.
 *
 * @param column - the column spec containing the column name to count, or `'*'` for row count.
 * @param tableJoinNameForKeys - original join table name used for the JSON key.
 * @returns SQL fragment for the `'count'` JSON key.
 * @throws No runtime errors.
 */
function buildCountExpression(column: { column: string }, tableJoinNameForKeys: string): string {
  const valueExpression = generateValueExpressionForCount(column.column);
  return `'count', json_object('${escapeSqlString(tableJoinNameForKeys)}', ${valueExpression})`;
}

/**
 * Builds the SQL expression for non-count/weighted/collect aggregate functions (sum, avg, min, max).
 *
 * Produces a `json_object` with one entry per column, keyed as `<tableJoinName>.<column>`.
 *
 * @param funcName - aggregate function name (e.g. `'sum'`, `'avg'`).
 * @param columns - columns to apply the function to.
 * @param tableJoin - join table metadata for value expression generation.
 * @param tableJoinNameForKeys - original join table name used for JSON keys.
 * @returns SQL fragment for the aggregate function's JSON object.
 * @throws No runtime errors.
 */
function buildNestedFunctionExpression(
  funcName: string,
  columns: Array<{ column: string }>,
  tableJoin: Table,
  tableJoinNameForKeys: string,
): string {
  const functionAttributes = columns
    .map((column) => {
      const valueExpression = generateValueExpression(tableJoin, column.column, funcName.toUpperCase());
      const columnName = `${tableJoinNameForKeys}.${column.column}`;
      return `'${escapeSqlString(columnName)}', ${valueExpression}`;
    })
    .join(', ');

  return `'${escapeSqlString(funcName)}', json_object(${functionAttributes})`;
}

/**
 * Builds the SQL expression for non-aggregated columns in the group-by clause.
 *
 * @param nonAggregateColumns - columns that pass through without aggregation.
 * @param tableJoin - join table metadata for value expression generation.
 * @returns SQL fragment for non-aggregated column entries in the sjoin object.
 * @throws No runtime errors.
 */
function buildNonAggregateColumns(
  nonAggregateColumns: Array<{ column: string }>,
  tableJoin: Table,
): string {
  return nonAggregateColumns
    .map((column) => {
      const valueExpression = buildColumnValueExpression(tableJoin, column.column);
      return `'${escapeSqlString(column.column)}', ${valueExpression}`;
    })
    .join(', ');
}

/**
 * Builds a `COUNT` SQL expression for the given column.
 *
 * @param columnName - column name to count, or `'*'` for all rows.
 * @returns SQL count expression string.
 * @throws No runtime errors.
 */
function generateValueExpressionForCount(columnName: string): string {
  if (columnName === '*') {
    return 'COUNT(*)';
  }
  return `COUNT(${quoteIdentifier(columnName)})`;
}

/**
 * Builds a generic aggregation SQL expression for a column.
 *
 * For `COLLECT`, wraps values in `json_group_array`. For other functions, casts to `DOUBLE` (except `COUNT`).
 *
 * @param table - table metadata determining whether to use JSON extract or direct reference.
 * @param columnName - column name to aggregate.
 * @param aggregateFunction - uppercase function name (`'SUM'`, `'AVG'`, etc.).
 * @returns SQL expression string for the aggregation.
 * @throws No runtime errors.
 */
function generateValueExpression(table: Table, columnName: string, aggregateFunction: string): string {
  if (aggregateFunction === 'COLLECT') {
    if (columnName === '*') {
      return `json_group_array(${buildRowObjectExpression(table)})`;
    }
    const colExpr = buildColumnValueExpression(table, columnName);
    return `json_group_array(json_object('${escapeSqlString(columnName)}', ${colExpr}))`;
  }

  const valueExpression = buildColumnValueExpression(table, columnName);
  const castExpr = aggregateFunction === 'COUNT' ? valueExpression : `CAST(${valueExpression} AS DOUBLE)`;
  return `${aggregateFunction}(${castExpr})`;
}

/**
 * Builds a SQL expression to access a column value from the join table.
 *
 * For tables with a `properties` JSON column, uses `properties->>'path'`. For others, uses direct `table.column` reference.
 *
 * @param table - table metadata determining the access strategy.
 * @param columnPath - column name or dot-path within properties.
 * @returns SQL expression string.
 * @throws No runtime errors.
 */
function buildColumnValueExpression(table: Table, columnPath: string): string {
  if (hasPropertiesColumn(table)) {
    return buildJsonExtract(table.name, columnPath);
  }
  return buildDirectColumnReference(table.name, columnPath);
}

/**
 * Builds a SQL expression for the root table's properties object.
 *
 * For tables with a `properties` JSON column, casts and coalesces it. For others, builds a `json_object` from non-geometry columns.
 *
 * @param table - table metadata.
 * @returns SQL expression for the properties object.
 * @throws No runtime errors.
 */
function buildPropertiesObjectExpression(table: Table): string {
  if (hasPropertiesColumn(table)) {
    return `COALESCE(CAST(${table.name}.properties AS JSON), '{}'::JSON)`;
  }
  return buildRowObjectExpression(table);
}

/**
 * Builds a `json_object` expression from all non-geometry columns of a table.
 *
 * @param table - table metadata.
 * @returns SQL `json_object(...)` string, or `'{}'::JSON` if no property columns exist.
 * @throws No runtime errors.
 */
function buildRowObjectExpression(table: Table): string {
  const propertyColumns = table.columns.filter((column) => column.type !== 'GEOMETRY' && column.name !== 'properties');
  if (propertyColumns.length === 0) {
    return `'{}'::JSON`;
  }

  return `json_object(${propertyColumns
    .map((column) => `'${escapeSqlString(column.name)}', ${buildDirectColumnReference(table.name, column.name)}`)
    .join(', ')})`;
}

/**
 * Builds a DuckDB JSON extract chain for a nested property path.
 *
 * Converts `'properties.a.b.c'` into `table.properties->'a'->'b'->>'c'`.
 *
 * @param tableName - table alias used in the expression.
 * @param columnPath - dot-separated path within the properties JSON.
 * @returns SQL JSON extract expression string.
 * @throws No runtime errors.
 */
function buildJsonExtract(tableName: string, columnPath: string): string {
  const parts = columnPath.split('.');
  const last = parts.pop()!;
  const chain = parts.reduce((acc, p) => `${acc}->'${escapeSqlString(p)}'`, `${tableName}.properties`);
  return `${chain}->>'${escapeSqlString(last)}'`;
}

/**
 * Builds a `SELECT * REPLACE` SQL fragment that normalizes aggregated values to 0-1 range.
 *
 * Uses window functions (`MIN`/`MAX OVER`) to compute min-max normalization for each normalized column.
 *
 * @param normalizedColumns - columns marked with `normalize: true`.
 * @param tableJoinName - original join table name used for JSON path derivation.
 * @returns SQL expression for the `REPLACE(...)` clause.
 * @throws No runtime errors.
 */
function buildNormalizationMergePatch(normalizedColumns: Array<InternalColumn>, tableJoinName: string): string {
  const byAggFn: Record<string, Array<{ colKey: string; jsonPath: string }>> = {};

  for (const col of normalizedColumns) {
    const funcName = col.aggregateFn?.toLowerCase() ?? 'value';
    const colKey =
      funcName === 'count' || funcName === 'weighted' || funcName === 'collect'
        ? tableJoinName
        : `${tableJoinName}.${col.column}`;
    const jsonPath = `$.sjoin.${funcName}.${colKey}`;

    if (!byAggFn[funcName]) byAggFn[funcName] = [];
    byAggFn[funcName].push({ colKey, jsonPath });
  }

  const aggFnParts = Object.entries(byAggFn)
    .map(([funcName, cols]) => {
      const colParts = cols
        .map(({ colKey, jsonPath }) => {
          const rawVal = `COALESCE(json_extract(properties, '${escapeSqlString(jsonPath)}')::DOUBLE, 0)`;
          const normExpr =
            `(${rawVal} - MIN(${rawVal}) OVER ()) / ` +
            `NULLIF(MAX(${rawVal}) OVER () - MIN(${rawVal}) OVER (), 0)`;
          return `'${escapeSqlString(colKey)}_norm', ${normExpr}`;
        })
        .join(',\n          ');
      return `'${escapeSqlString(funcName)}', json_object(${colParts})`;
    })
    .join(',\n      ');

  return `json_merge_patch(
      properties,
      json_object('sjoin', json_object(
        ${aggFnParts}
      ))
    )`;
}

/**
 * Builds the SELECT clause for a simple (non-aggregated) spatial join.
 *
 * Merges join-side properties into the root table's properties under the `'sjoin'` key.
 *
 * @param tableRoot - root table metadata.
 * @param tableJoin - join table metadata.
 * @param geometricColumnJoin - geometry column name in the join table (excluded from properties).
 * @returns SQL SELECT clause string.
 * @throws No runtime errors.
 */
function buildSimpleJoinSelect(tableRoot: Table, tableJoin: Table, geometricColumnJoin: string): string {
  const additionalColumns = getAdditionalRootColumns(tableRoot);
  const additionalColumnsStr =
    additionalColumns.length > 0 ? `,\n        ${additionalColumns.join(',\n        ')}` : '';

  const joinPropertiesExpr = hasPropertiesColumn(tableJoin)
    ? `COALESCE(CAST(${tableJoin.name}.properties AS JSON), '{}'::JSON)`
    : `json_object(${tableJoin.columns
        .filter((column) => column.name !== geometricColumnJoin && column.type !== 'GEOMETRY')
        .map((column) => `'${escapeSqlString(column.name)}', ${buildDirectColumnReference(tableJoin.name, column.name)}`)
        .join(', ')})`;

  return `
      SELECT 
        ${tableRoot.name}.geometry,
        json_merge_patch(
          json_object('sjoin', ${joinPropertiesExpr}),
          ${buildPropertiesObjectExpression(tableRoot)}
        ) AS properties${additionalColumnsStr}
    `;
}

/**
 * Builds the JOIN clause for the spatial join.
 *
 * For `'NEAR'`, uses `ST_Distance` with the CTE alias. For `'INTERSECT'`, uses `ST_Intersects` with the fully-qualified table.
 *
 * @param params - join configuration including predicate, tables, and geometry columns.
 * @returns SQL JOIN clause string.
 * @throws No runtime errors.
 */
function getJoinString({
  spatialPredicate,
  qualifiedTableJoinName,
  tableJoin,
  tableRoot,
  geometricColumnRoot,
  geometricColumnJoin,
  nearDistance,
  nearUseCentroid,
}: {
  spatialPredicate: string;
  qualifiedTableJoinName: string;
  tableJoin: Table;
  tableRoot: Table;
  geometricColumnRoot: string;
  geometricColumnJoin: string;
  nearDistance?: number;
  nearUseCentroid?: boolean;
}) {
  if (spatialPredicate === 'NEAR') {
    const rootExpr = nearUseCentroid
      ? `ST_Centroid(${tableRoot.name}.${quoteIdentifier(geometricColumnRoot)})`
      : `${tableRoot.name}.${quoteIdentifier(geometricColumnRoot)}`;
    const joinExpr = nearUseCentroid
      ? `ST_Centroid(${tableJoin.name}.${quoteIdentifier(geometricColumnJoin)})`
      : `${tableJoin.name}.${quoteIdentifier(geometricColumnJoin)}`;
    return `LEFT JOIN ${tableJoin.name} ON ST_Distance(${rootExpr}, ${joinExpr}) <= ${nearDistance}`;
  }

  return `LEFT JOIN ${qualifiedTableJoinName} AS ${tableJoin.name} ON ST_Intersects(${tableRoot.name}.${quoteIdentifier(geometricColumnRoot)}, ${tableJoin.name}.${quoteIdentifier(geometricColumnJoin)})`;
}

/**
 * Builds the GROUP BY clause from the root table's geometry and properties columns.
 *
 * @param tableRoot - root table metadata.
 * @returns SQL GROUP BY clause string.
 * @throws No runtime errors.
 */
function getGroupByString(tableRoot: Table) {
  const additionalColumns = getAdditionalRootColumns(tableRoot);
  const allGroupByColumns = [`${tableRoot.name}.geometry`, ...(hasPropertiesColumn(tableRoot) ? [`${tableRoot.name}.properties`] : []), ...additionalColumns];

  return `
    GROUP BY ${allGroupByColumns.join(', ')}
  `;
}

/**
 * Returns root table column references excluding `geometry` and `properties`.
 *
 * These columns are included in the GROUP BY and SELECT clauses alongside geometry and properties.
 *
 * @param tableRoot - root table metadata.
 * @returns array of qualified column reference strings.
 * @throws No runtime errors.
 */
function getAdditionalRootColumns(tableRoot: Table): string[] {
  return tableRoot.columns
    .filter((col) => col.name !== 'geometry' && col.name !== 'properties')
    .map((col) => `${tableRoot.name}.${quoteIdentifier(col.name)}`);
}

/**
 * Checks whether the table has a `properties` JSON column.
 *
 * @param table - table metadata to inspect.
 * @returns `true` if a column named `properties` exists.
 * @throws No runtime errors.
 */
function hasPropertiesColumn(table: Table): boolean {
  return table.columns.some((column) => column.name === 'properties');
}

/**
 * Builds a direct `table.column` SQL reference with proper identifier quoting.
 *
 * @param tableName - table alias.
 * @param columnName - column name.
 * @returns qualified column reference string.
 * @throws No runtime errors.
 */
function buildDirectColumnReference(tableName: string, columnName: string): string {
  return `${tableName}.${quoteIdentifier(columnName)}`;
}

/**
 * Quotes a SQL identifier with double quotes, escaping internal quotes.
 *
 * @param identifier - raw identifier name.
 * @returns quoted identifier string.
 * @throws No runtime errors.
 */
function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

/**
 * Escapes a string value for safe inclusion in a SQL string literal.
 *
 * Replaces single quotes with doubled single quotes (`''`).
 *
 * @param value - raw string to escape.
 * @returns escaped string safe for SQL literal context.
 * @throws No runtime errors.
 */
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
