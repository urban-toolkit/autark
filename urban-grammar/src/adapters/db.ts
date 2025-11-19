import { DbSourceSpec, Table } from "../types";

export interface DbAdapter {
    resolveSource(spec: DbSourceSpec): Promise<Table[]>;
}