import { Table } from '../../../shared/interfaces';

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

function getSelectString(params: {
  tableRoot: Table;
  tableJoin: Table;
  geometricColumnJoin: string;
  groupBy: {
    selectColumns: Array<{ table: Table; column: string; aggregateFn?: string }>;
  } | null;
}) {
  if (params.groupBy) {
    const groupByString = params.groupBy.selectColumns
      .map((column) => {
        if (column.aggregateFn) {
          if (column.table.type === 'layer' || column.table.type === 'custom-layer') {
            // Get attributes inside properties
            return `'${column.table.name}.${column.column} ${column.aggregateFn}', ${column.aggregateFn}(map_extract("${column.column}",  ${column.table.name}.properties))`;
          }

          return `'${column.table.name}.${column.column} ${column.aggregateFn}', ${column.aggregateFn}(${column.table.name}."${column.column}")`;
        }

        return `'${column.table.name}.${column.column}', ${column.table.name}."${column.column}"`;
      })
      .join(', ');

    return `
      SELECT 
        ${params.tableRoot.name}.geometry,
        json_merge_patch(
          json_object(
            ${groupByString}
          ),
          "${params.tableRoot.name}".properties
        ) AS properties
    `;
  }

  const propertiesFromJoin = params.tableJoin.columns
    .filter((column) => column.name !== params.geometricColumnJoin)
    .map((column) => `${params.tableJoin.name}."${column.name}"`)
    .join(', ');

  return `
      SELECT 
        ${params.tableRoot.name}.geometry,
        json_merge_patch(
          json_object(
            ${propertiesFromJoin}
          ),
          "${params.tableRoot.name}".properties
        ) AS properties
    `;
}

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

function getGroupByString(tableRoot: Table) {
  return `
    GROUP BY ${tableRoot.name}.geometry, ${tableRoot.name}.properties
  `;
}
