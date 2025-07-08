import { QueryParams, Select } from '../../shared/interfaces';

export class SelectUseCase {
  exec(selects: Array<Select>, queryParams: QueryParams): string {
    if (queryParams.spatialJoins.length > 0) return this.specialSelectWithSpatialJoin(queryParams);

    if (selects.length === 0) return `SELECT *`;
    const selectString = selects
      .map((select) => {
        return select.columns.map((column) => `${select.table.name}.${column}`).join(', ');
      })
      .join(', ');

    return `SELECT ${selectString} `;
  }

  private specialSelectWithSpatialJoin(queryParams: QueryParams): string {
    console.warn('Special select with spatial join ignroe any select columns'); // TODO: support select columns

    const rootTable = queryParams.table;
    const propertiesFromJoin = queryParams.spatialJoins
      .map((spatialJoin) => {
        return spatialJoin.tableJoin.columns
          .filter((column) => column.type !== 'GEOMETRY')
          .map(
            (column) =>
              `'${spatialJoin.tableJoin.name}.${column.name}', ${spatialJoin.tableJoin.name}."${column.name}"`,
          )
          .join(', ');
      })
      .flat();

    return `
      SELECT 
        ${rootTable.name}.geometry,
        json_merge_patch(
          json_object(
            ${propertiesFromJoin}
          ),
          "${rootTable.name}".properties
        ) AS properties
    `;
  }
}
