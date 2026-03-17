import { Table } from '../../../shared/interfaces';
import { isLayerType } from '../load-layer/interfaces';

interface Params {
  tableRoot: Table;
  tableJoin: Table;
  geometricColumnRoot: string;
  geometricColumnJoin: string;
  joinType: string;
  spatialPredicate: string;
  nearDistance?: number;
  groupBy: {
    selectColumns: Array<{ table: Table; column: string; aggregateFn?: string; aggregateFnResultColumnName?: string }>;
  } | null;
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
    geometricColumnJoin: params.geometricColumnJoin,
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
  });

  const groupByString = getGroupByString(params.tableRoot);

  // For NEAR queries: prepend a CTE that pre-filters the join table using an
  // ST_Intersects WHERE clause. DuckDB's R-tree index only fires on WHERE-clause
  // spatial predicates — not JOIN ON conditions — so this is the only way to
  // leverage the index that was created on the CSV geometry column.
  //
  // The CTE computes a single bounding envelope for the entire root table
  // (expanded by nearDistance), then filters the join table rows to only those
  // whose geometry intersects that envelope. This shrinks the join table from
  // potentially millions of rows down to a small local candidate set before the
  // precise ST_Distance check runs per-row in the outer join.
  const ctePrefix = isNear
    ? `WITH ${NEAR_CTE_ALIAS} AS (
        SELECT * FROM ${params.tableJoin.name}
        WHERE ST_Intersects(
          (SELECT ST_Union_Agg(ST_Expand("${params.geometricColumnRoot}", ${params.nearDistance})) FROM ${params.tableRoot.name}),
          ${params.tableJoin.name}."${params.geometricColumnJoin}"
        )
      )`
    : '';

  return `
    ${ctePrefix}
    ${selectString}
    FROM ${params.tableRoot.name}
    ${joinString}
    ${params.groupBy ? groupByString : ''};
  `;
};

/* Select Logic */
function getSelectString(params: {
  tableRoot: Table;
  tableJoin: Table;
  geometricColumnJoin: string;
  groupBy: {
    selectColumns: Array<{ table: Table; column: string; aggregateFn?: string; aggregateFnResultColumnName?: string }>;
  } | null;
}) {
  if (params.groupBy) {
    const { aggregatesByFunction, nonAggregateColumns } = groupColumnsByAggregateFunction(params.groupBy.selectColumns);
    const sjoinObjectSql = buildSjoinObject(aggregatesByFunction, nonAggregateColumns);

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

function groupColumnsByAggregateFunction(
  selectColumns: Array<{ table: Table; column: string; aggregateFn?: string; aggregateFnResultColumnName?: string }>,
) {
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
): string {
  const sjoinParts: string[] = [];

  // Handle aggregate functions
  Object.entries(aggregatesByFunction).forEach(([funcName, columns]) => {
    if (funcName === 'count') {
      sjoinParts.push(buildCountExpression(columns[0]));
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
      const valueExpression = isLayerType(column.table.type)
        ? `map_extract("${column.column}", ${column.table.name}.properties)`
        : `${column.table.name}."${column.column}"`;
      const columnName = column.aggregateFnResultColumnName || column.column;
      return `'${columnName}', ${valueExpression}`;
    })
    .join(', ');
}

function generateValueExpression(table: Table, columnName: string, aggregateFunction: string): string {
  if (isLayerType(table.type)) {
    return `${aggregateFunction}(map_extract("${columnName}", ${table.name}.properties))`;
  }
  return `${aggregateFunction}(${table.name}."${columnName}")`;
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
}: {
  spatialPredicate: string;
  joinType: string;
  tableJoin: Table;
  tableRoot: Table;
  geometricColumnRoot: string;
  geometricColumnJoin: string;
  nearDistance?: number;
}) {
  if (spatialPredicate === 'NEAR')
    // The join table here is already the CTE alias (csv_candidates), which has been
    // pre-filtered to the local bounding box. The R-tree index on the original CSV
    // table was used in the CTE's WHERE clause. Here we only need the precise distance
    // check against the small surviving candidate set.
    return `${joinType || ''} JOIN ${tableJoin.name} ON ST_Distance(${tableRoot.name}."${geometricColumnRoot}", ${tableJoin.name}."${geometricColumnJoin}") <= ${nearDistance}`;

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
