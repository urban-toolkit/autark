import { Table } from '../../../shared/interfaces';
import { isLayerType } from '../load-layer/interfaces';

type InternalColumn = { table: Table; column: string; aggregateFn?: string; aggregateFnResultColumnName?: string; normalize?: boolean };

interface Params {
  tableRoot: Table;
  tableJoin: Table;
  geometricColumnRoot: string;
  geometricColumnJoin: string;
  joinType: string;
  spatialPredicate: string;
  nearDistance?: number;
  nearUseCentroid?: boolean;
  groupBy: { selectColumns: Array<InternalColumn> } | null;
  outputTableName: string;
}

// Alias used for the pre-filtered join table CTE in NEAR queries
const NEAR_CTE_ALIAS = 'csv_candidates';

export const SPATIAL_JOIN_QUERY = (params: Params) => {
  const isNear = params.spatialPredicate === 'NEAR';

  // For NEAR queries we reference the CTE alias instead of the real table name
  // in both the SELECT and JOIN clauses, so the optimizer sees a pre-filtered dataset.
  const effectiveJoinTable: Table = isNear
    ? { ...params.tableJoin, name: NEAR_CTE_ALIAS }
    : params.tableJoin;

  // Also remap any groupBy column references that point to the join table so that
  // generated expressions like COUNT(noise."col") become COUNT(csv_candidates."col").
  const effectiveGroupBy = isNear && params.groupBy
    ? {
      selectColumns: params.groupBy.selectColumns.map((col) => ({
        ...col,
        // Preserve the original table name as the result column name so the generated
        // JSON key stays e.g. 'noise' instead of falling back to 'csv_candidates'.
        aggregateFnResultColumnName: col.aggregateFnResultColumnName ?? (col.table.name === params.tableJoin.name ? col.table.name : undefined),
        table: col.table.name === params.tableJoin.name ? effectiveJoinTable : col.table,
      })),
    }
    : params.groupBy;

  const selectString = getSelectString({
    tableRoot: params.tableRoot,
    tableJoin: effectiveJoinTable,
    geometricColumnRoot: params.geometricColumnRoot,
    geometricColumnJoin: params.geometricColumnJoin,
    nearUseCentroid: params.nearUseCentroid,
    groupBy: effectiveGroupBy,
  });

  const joinString = getJoinString({
    spatialPredicate: params.spatialPredicate,
    joinType: params.joinType,
    tableJoin: effectiveJoinTable,
    tableRoot: params.tableRoot,
    geometricColumnRoot: params.geometricColumnRoot,
    geometricColumnJoin: params.geometricColumnJoin,
    nearDistance: params.nearDistance,
    nearUseCentroid: params.nearUseCentroid,
  });

  const groupByString = getGroupByString(params.tableRoot);

  // For NEAR queries: a CTE that pre-filters the join table using an ST_Intersects
  // WHERE clause so the R-tree index fires. Stored separately so it can be combined
  // with a normalization CTE when needed.
  const rootGeomExpr = (col: string) =>
    params.nearUseCentroid ? `ST_Centroid("${col}")` : `"${col}"`;

  const nearCtePart = isNear
    ? `${NEAR_CTE_ALIAS} AS (
        SELECT * FROM ${params.tableJoin.name}
        WHERE ST_Intersects(
          (SELECT ST_Union_Agg(ST_Expand(${rootGeomExpr(params.geometricColumnRoot)}, ${params.nearDistance})) FROM ${params.tableRoot.name}),
          ${params.tableJoin.name}."${params.geometricColumnJoin}"
        )
      )`
    : null;

  const innerQuery = `
    ${selectString}
    FROM ${params.tableRoot.name}
    ${joinString}
    ${params.groupBy ? groupByString : ''}
  `;

  const normalizedColumns = effectiveGroupBy?.selectColumns.filter((col) => col.normalize) ?? [];

  if (normalizedColumns.length > 0) {
    const cteParts = [...(nearCtePart ? [nearCtePart] : []), `sjoin_base AS (${innerQuery})`];
    const normPatch = buildNormalizationMergePatch(normalizedColumns);
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

/* Select Logic */
function getSelectString(params: {
  tableRoot: Table;
  tableJoin: Table;
  geometricColumnRoot: string;
  geometricColumnJoin: string;
  nearUseCentroid?: boolean;
  groupBy: { selectColumns: Array<InternalColumn> } | null;
}) {
  if (params.groupBy) {
    const { aggregatesByFunction, nonAggregateColumns } = groupColumnsByAggregateFunction(params.groupBy.selectColumns);
    const sjoinObjectSql = buildSjoinObject(aggregatesByFunction, nonAggregateColumns, {
      tableRoot: params.tableRoot,
      tableJoin: params.tableJoin,
      geometricColumnRoot: params.geometricColumnRoot,
      geometricColumnJoin: params.geometricColumnJoin,
      nearUseCentroid: params.nearUseCentroid,
    });

    // Get all additional columns from tableRoot (excluding geometry and properties)
    const additionalColumns = params.tableRoot.columns
      .filter((col) => col.name !== 'geometry' && col.name !== 'properties')
      .map((col) => `${params.tableRoot.name}.${col.name}`);

    const additionalColumnsStr =
      additionalColumns.length > 0 ? `,\n        ${additionalColumns.join(',\n        ')}` : '';

    return `
      SELECT 
        ${params.tableRoot.name}.geometry,
        json_merge_patch(
          COALESCE(CAST("${params.tableRoot.name}".properties AS JSON), '{}'::JSON),
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

function groupColumnsByAggregateFunction(selectColumns: Array<InternalColumn>) {
  const aggregatesByFunction: Record<
    string,
    Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }>
  > = {};
  const nonAggregateColumns: Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }> = [];

  selectColumns.forEach((column) => {
    if (column.aggregateFn) {
      const funcName = column.aggregateFn.toLowerCase();
      if (!aggregatesByFunction[funcName]) {
        aggregatesByFunction[funcName] = [];
      }
      aggregatesByFunction[funcName].push({
        table: column.table,
        column: column.column,
        aggregateFnResultColumnName: column.aggregateFnResultColumnName,
      });
    } else {
      nonAggregateColumns.push({
        table: column.table,
        column: column.column,
        aggregateFnResultColumnName: column.aggregateFnResultColumnName,
      });
    }
  });

  return { aggregatesByFunction, nonAggregateColumns };
}

function buildSjoinObject(
  aggregatesByFunction: Record<string, Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }>>,
  nonAggregateColumns: Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }>,
  geomContext: { tableRoot: Table; tableJoin: Table; geometricColumnRoot: string; geometricColumnJoin: string; nearUseCentroid?: boolean },
): string {
  const sjoinParts: string[] = [];

  // Handle aggregate functions
  Object.entries(aggregatesByFunction).forEach(([funcName, columns]) => {
    if (funcName === 'count') {
      sjoinParts.push(buildCountExpression(columns[0]));
    } else if (funcName === 'weighted') {
      sjoinParts.push(buildWeightedExpression(columns[0], geomContext));
    } else if (funcName === 'collect') {
      sjoinParts.push(buildCollectExpression(columns[0]));
    } else {
      sjoinParts.push(buildNestedFunctionExpression(funcName, columns));
    }
  });

  // Handle non-aggregate columns
  if (nonAggregateColumns.length > 0) {
    sjoinParts.push(buildNonAggregateColumns(nonAggregateColumns));
  }

  return sjoinParts.join(', ');
}

function buildWeightedExpression(
  column: { table: Table; column: string; aggregateFnResultColumnName?: string },
  geomContext: { tableRoot: Table; tableJoin: Table; geometricColumnRoot: string; geometricColumnJoin: string; nearUseCentroid?: boolean },
): string {
  const { tableRoot, tableJoin, geometricColumnRoot, geometricColumnJoin, nearUseCentroid } = geomContext;
  const rootGeom = nearUseCentroid
    ? `ST_Centroid(${tableRoot.name}."${geometricColumnRoot}")`
    : `${tableRoot.name}."${geometricColumnRoot}"`;
  const joinGeom = nearUseCentroid
    ? `ST_Centroid(${tableJoin.name}."${geometricColumnJoin}")`
    : `${tableJoin.name}."${geometricColumnJoin}"`;
  const columnName = column.aggregateFnResultColumnName ?? column.table.name;
  return `'weighted', json_object('${columnName}', SUM(1.0 / (ST_Distance(${rootGeom}, ${joinGeom}) + 1.0)))`;
}

function buildCollectExpression(column: { table: Table; column: string; aggregateFnResultColumnName?: string }): string {
  const columnName = column.aggregateFnResultColumnName ?? column.table.name;
  const valueExpression = generateValueExpression(column.table, column.column, 'COLLECT');
  return `'collect', json_object('${columnName}', ${valueExpression})`;
}

function buildCollectColumnExpression(table: Table, columnName: string): string {
  if (table.source === 'geotiff') return `${table.name}.properties.${columnName}`;
  if (isLayerType(table.type)) return buildJsonExtract(table.name, columnName);
  return `${table.name}."${columnName}"`;
}

function buildCountExpression(column: { table: Table; column: string; aggregateFnResultColumnName?: string }): string {
  const valueExpression = generateValueExpression(column.table, column.column, 'COUNT');
  const columnName = column.aggregateFnResultColumnName || column.table.name;
  return `'count', json_object('${columnName}', ${valueExpression})`;
}

function buildNestedFunctionExpression(
  funcName: string,
  columns: Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }>,
): string {
  const functionAttributes = columns
    .map((column) => {
      const valueExpression = generateValueExpression(column.table, column.column, funcName.toUpperCase());
      const columnName = column.aggregateFnResultColumnName || `${column.table.name}.${column.column}`;
      return `'${columnName}', ${valueExpression}`;
    })
    .join(', ');

  return `'${funcName}', json_object(${functionAttributes})`;
}

function buildNonAggregateColumns(
  nonAggregateColumns: Array<{ table: Table; column: string; aggregateFnResultColumnName?: string }>,
): string {
  return nonAggregateColumns
    .map((column) => {
      const valueExpression = column.table.source === 'geotiff'
        ? `${column.table.name}.properties.${column.column}`
        : isLayerType(column.table.type)
          ? buildJsonExtract(column.table.name, column.column)
          : `${column.table.name}."${column.column}"`;
      const columnName = column.aggregateFnResultColumnName || column.column;
      return `'${columnName}', ${valueExpression}`;
    })
    .join(', ');
}

function generateValueExpression(table: Table, columnName: string, aggregateFunction: string): string {
  if (aggregateFunction === 'COLLECT') {
    // '*' collects the entire properties object of the join row; otherwise collects a specific column.
    if (columnName === '*') {
      if (table.source === 'geotiff') return `json_group_array(${table.name}.properties)`;
      if (isLayerType(table.type)) return `json_group_array(CAST(${table.name}.properties AS JSON))`;
      // CSV/JSON tables: build a json_object from all non-geometry columns
      const cols = table.columns
        .filter(c => c.name !== 'geometry')
        .map(c => `'${c.name}', ${table.name}."${c.name}"`)
        .join(', ');
      return `json_group_array(json_object(${cols}))`;
    }
    // Single-column collect: wrap in json_object so consumers always get an array of objects.
    const colExpr = buildCollectColumnExpression(table, columnName);
    return `json_group_array(json_object('${columnName}', ${colExpr}))`;
  }
  if (table.source === 'geotiff') {
    return `${aggregateFunction}(${table.name}.properties.${columnName})`;
  }
  if (isLayerType(table.type)) {
    const extract = buildJsonExtract(table.name, columnName);
    const castExpr = aggregateFunction === 'COUNT' ? extract : `CAST(${extract} AS DOUBLE)`;
    return `${aggregateFunction}(${castExpr})`;
  }
  return `${aggregateFunction}(${table.name}."${columnName}")`;
}

/**
 * Builds a DuckDB JSON/STRUCT extraction expression for a (possibly nested) column path.
 * Supports dot-notation paths like 'compute.skyViewFactor'.
 * Uses chained -> / ->> operators which work for both DuckDB STRUCT and JSON column types.
 */
function buildJsonExtract(tableName: string, columnPath: string): string {
  const parts = columnPath.split('.');
  const last = parts.pop()!;
  const chain = parts.reduce((acc, p) => `${acc}->'${p}'`, `${tableName}.properties`);
  return `${chain}->>'${last}'`;
}

function buildNormalizationMergePatch(normalizedColumns: Array<InternalColumn>): string {
  // Group columns by aggregateFn so we can build the nested sjoin JSON structure
  const byAggFn: Record<string, Array<{ colKey: string; jsonPath: string }>> = {};

  for (const col of normalizedColumns) {
    const funcName = col.aggregateFn?.toLowerCase() ?? 'value';
    const colKey =
      funcName === 'count'
        ? (col.aggregateFnResultColumnName ?? col.table.name)
        : (col.aggregateFnResultColumnName ?? `${col.table.name}.${col.column}`);
    const jsonPath = `$.sjoin.${funcName}.${colKey}`;

    if (!byAggFn[funcName]) byAggFn[funcName] = [];
    byAggFn[funcName].push({ colKey, jsonPath });
  }

  const aggFnParts = Object.entries(byAggFn)
    .map(([funcName, cols]) => {
      const colParts = cols
        .map(({ colKey, jsonPath }) => {
          const rawVal = `COALESCE(json_extract(properties, '${jsonPath}')::DOUBLE, 0)`;
          const normExpr =
            `(${rawVal} - MIN(${rawVal}) OVER ()) / ` +
            `NULLIF(MAX(${rawVal}) OVER () - MIN(${rawVal}) OVER (), 0)`;
          return `'${colKey}_norm', ${normExpr}`;
        })
        .join(',\n          ');
      return `'${funcName}', json_object(${colParts})`;
    })
    .join(',\n      ');

  return `json_merge_patch(
      properties,
      json_object('sjoin', json_object(
        ${aggFnParts}
      ))
    )`;
}

function buildSimpleJoinSelect(tableRoot: Table, tableJoin: Table, geometricColumnJoin: string): string {
  // Get all additional columns from tableRoot (excluding geometry and properties)
  const additionalColumns = tableRoot.columns
    .filter((col) => col.name !== 'geometry' && col.name !== 'properties')
    .map((col) => `${tableRoot.name}.${col.name}`);

  const additionalColumnsStr =
    additionalColumns.length > 0 ? `,\n        ${additionalColumns.join(',\n        ')}` : '';

  // When the join table is a layer type (OSM / GeoJSON), its data lives in a 'properties'
  // JSON column. Using json_object(tableJoin.properties) would fail because json_object()
  // requires an even number of key-value pair arguments. Instead, merge the JSON blob directly.
  const joinPropertiesExpr = isLayerType(tableJoin.type)
    ? `COALESCE(CAST(${tableJoin.name}.properties AS JSON), '{}'::JSON)`
    : `json_object(${tableJoin.columns
        .filter((column) => column.name !== geometricColumnJoin)
        .map((column) => `'${column.name}', ${tableJoin.name}."${column.name}"`)
        .join(', ')})`;

  return `
      SELECT 
        ${tableRoot.name}.geometry,
        json_merge_patch(
          json_object('sjoin', ${joinPropertiesExpr}),
          COALESCE(CAST("${tableRoot.name}".properties AS JSON), '{}'::JSON)
        ) AS properties${additionalColumnsStr}
    `;
}


/* Join Logic */
function getJoinString({
  spatialPredicate,
  joinType,
  tableJoin,
  tableRoot,
  geometricColumnRoot,
  geometricColumnJoin,
  nearDistance,
  nearUseCentroid,
}: {
  spatialPredicate: string;
  joinType: string;
  tableJoin: Table;
  tableRoot: Table;
  geometricColumnRoot: string;
  geometricColumnJoin: string;
  nearDistance?: number;
  nearUseCentroid?: boolean;
}) {
  if (spatialPredicate === 'NEAR') {
    const rootExpr = nearUseCentroid
      ? `ST_Centroid(${tableRoot.name}."${geometricColumnRoot}")`
      : `${tableRoot.name}."${geometricColumnRoot}"`;
    const joinExpr = nearUseCentroid
      ? `ST_Centroid(${tableJoin.name}."${geometricColumnJoin}")`
      : `${tableJoin.name}."${geometricColumnJoin}"`;
    return `${joinType || ''} JOIN ${tableJoin.name} ON ST_Distance(${rootExpr}, ${joinExpr}) <= ${nearDistance}`;
  }

  return `${joinType || ''} JOIN ${tableJoin.name} ON ST_Intersects( ${tableRoot.name}."${geometricColumnRoot}", ${tableJoin.name}."${geometricColumnJoin}")`;
}

/* Group By Logic */
function getGroupByString(tableRoot: Table) {
  // Get all additional columns from tableRoot (excluding geometry and properties)
  const additionalColumns = tableRoot.columns
    .filter((col) => col.name !== 'geometry' && col.name !== 'properties')
    .map((col) => `${tableRoot.name}.${col.name}`);

  const allGroupByColumns = [`${tableRoot.name}.geometry`, `${tableRoot.name}.properties`, ...additionalColumns];

  return `
    GROUP BY ${allGroupByColumns.join(', ')}
  `;
}
