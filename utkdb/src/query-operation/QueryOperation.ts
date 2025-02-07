import { QueryParams } from './shared/interfaces';
import { SelectUseCase, FilterUseCase, JoinUseCase } from './use-cases';

export class QueryOperation {
  private queryParams: QueryParams;
  private selectUseCase: SelectUseCase;
  private filterUseCase: FilterUseCase;
  private joinUseCase: JoinUseCase;

  constructor(tableName: string) {
    this.queryParams = {
      table: tableName,
      filters: [],
      selects: [],
      joins: [],
    };
    this.selectUseCase = new SelectUseCase();
    this.filterUseCase = new FilterUseCase();
    this.joinUseCase = new JoinUseCase();
  }

  filter(params: { table?: string; column: string; value: string }): QueryOperation {
    this.queryParams.filters.push({
      table: params.table || this.queryParams.table,
      column: params.column,
      value: params.value,
    });
    return this;
  }

  select(params: { table?: string; columns: Array<string> }): QueryOperation {
    this.queryParams.selects.push({
      table: params.table || this.queryParams.table,
      columns: params.columns,
    });
    return this;
  }

  join(params: { tableRoot: string; tableJoin: string; columnRoot: string; columnJoin: string }): QueryOperation {
    this.queryParams.joins.push(params);
    return this;
  }

  getSql(): string {
    return `
      ${this.selectUseCase.exec(this.queryParams.selects)}
      from ${this.queryParams.table}
      ${this.joinUseCase.exec(this.queryParams.joins)}
      ${this.filterUseCase.exec(this.queryParams.filters)}
      ;
      `;
  }
}
