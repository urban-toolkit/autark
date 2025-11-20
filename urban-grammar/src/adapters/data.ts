import { DataSourceSpec } from "../types";

export interface DataAdapter {
    resolveSource(spec: DataSourceSpec): Promise<unknown>;
}