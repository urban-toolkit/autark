import { Column } from '../../shared/interfaces';

type DuckDbTableDescriptionColumn = {
  column_name: string;
  column_type: string;
};

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
