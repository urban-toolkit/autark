import { DataSourceSpec } from "../types";

export interface DataAdapter {
    resolveSource(context: unknown, spec: DataSourceSpec): Promise<unknown>;
}