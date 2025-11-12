import { DbSourceSpec } from "../types";

export interface DbAdapter {
    resolveSource(spec: DbSourceSpec): Promise<unknown>;
}