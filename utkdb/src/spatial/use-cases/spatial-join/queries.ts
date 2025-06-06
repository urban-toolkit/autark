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
    selectColumns: Array<{ table: Table; column: string; aggregateFn?: string }>;
  } | null;
  outputTableName: string;
}

export const SPATIAL_JOIN_QUERY = (params: Params) => {
  const selectString = getSelectString({
    tableRoot: params.tableRoot,
    tableJoin: params.tableJoin,
    geometricColumnJoin: params.geometricColumnJoin,
    groupBy: params.groupBy,
  });

  const joinString = getJoinString({
    spatialPredicate: params.spatialPredicate,
    joinType: params.joinType,
    tableJoin: params.tableJoin,
    tableRoot: params.tableRoot,
    geometricColumnRoot: params.geometricColumnRoot,
    geometricColumnJoin: params.geometricColumnJoin,
    nearDistance: params.nearDistance,
  });

  const groupByString = getGroupByString(params.tableRoot);

  return `
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
    selectColumns: Array<{ table: Table; column: string; aggregateFn?: string }>;
  } | null;
}) {
  if (params.groupBy) {
    const { aggregatesByFunction, nonAggregateColumns } = groupColumnsByAggregateFunction(params.groupBy.selectColumns);
    const sjoinObjectSql = buildSjoinObject(aggregatesByFunction, nonAggregateColumns);

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
        ) AS properties
    `;
  }

  return buildSimpleJoinSelect(params.tableRoot, params.tableJoin, params.geometricColumnJoin);
}

function groupColumnsByAggregateFunction(selectColumns: Array<{ table: Table; column: string; aggregateFn?: string }>) {
  const aggregatesByFunction: Record<string, Array<{ table: Table; column: string }>> = {};
  const nonAggregateColumns: Array<{ table: Table; column: string }> = [];

  selectColumns.forEach((column) => {
    if (column.aggregateFn) {
      const funcName = column.aggregateFn.toLowerCase();
      if (!aggregatesByFunction[funcName]) {
        aggregatesByFunction[funcName] = [];
      }
      aggregatesByFunction[funcName].push({ table: column.table, column: column.column });
    } else {
      nonAggregateColumns.push({ table: column.table, column: column.column });
    }
  });

  return { aggregatesByFunction, nonAggregateColumns };
}

function buildSjoinObject(
  aggregatesByFunction: Record<string, Array<{ table: Table; column: string }>>,
  nonAggregateColumns: Array<{ table: Table; column: string }>,
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

function buildCountExpression(column: { table: Table; column: string }): string {
  const valueExpression = generateValueExpression(column.table, column.column, 'COUNT');
  return `'count', ${valueExpression}`;
}

function buildNestedFunctionExpression(funcName: string, columns: Array<{ table: Table; column: string }>): string {
  const functionAttributes = columns
    .map((column) => {
      const valueExpression = generateValueExpression(column.table, column.column, funcName.toUpperCase());
      return `'${column.column}', ${valueExpression}`;
    })
    .join(', ');

  return `'${funcName}', json_object(${functionAttributes})`;
}

function buildNonAggregateColumns(nonAggregateColumns: Array<{ table: Table; column: string }>): string {
  return nonAggregateColumns
    .map((column) => {
      const valueExpression = isLayerType(column.table.type)
        ? `map_extract("${column.column}", ${column.table.name}.properties)`
        : `${column.table.name}."${column.column}"`;
      return `'${column.column}', ${valueExpression}`;
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
  const propertiesFromJoin = tableJoin.columns
    .filter((column) => column.name !== geometricColumnJoin)
    .map((column) => `${tableJoin.name}."${column.name}"`)
    .join(', ');

  return `
      SELECT 
        ${tableRoot.name}.geometry,
        json_merge_patch(
          json_object(
            ${propertiesFromJoin}
          ),
          COALESCE(CAST("${tableRoot.name}".properties AS JSON), '{}'::JSON)
        ) AS properties
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
    return `${joinType || ''} JOIN ${tableJoin.name} ON ST_Distance( ${tableRoot.name}."${geometricColumnRoot}", ${tableJoin.name}."${geometricColumnJoin}") <= ${nearDistance}`;

  return `${joinType || ''} JOIN ${tableJoin.name} ON ST_Intersects( ${tableRoot.name}."${geometricColumnRoot}", ${tableJoin.name}."${geometricColumnJoin}")`;
}

/* Group By Logic */
function getGroupByString(tableRoot: Table) {
  return `
    GROUP BY ${tableRoot.name}.geometry, ${tableRoot.name}.properties
  `;
}
