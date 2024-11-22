import { Column } from './interfaces';

type DuckDbTableDescriptionColumn = {
  column_name: string;
  column_type: string;
};

export function getColumnsFromDuckDbTableDescription(
  tableDescriptionResponse: Array<DuckDbTableDescriptionColumn>,
): Array<Column> {
  return tableDescriptionResponse.map((column: DuckDbTableDescriptionColumn) => {
    return {
      name: column.column_name,
      type: column.column_type,
    };
  });
}
