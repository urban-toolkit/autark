import { MapSpec, Table } from "../types";

export interface MapAdapter {
    resolveMap(tables: Table[], spec: MapSpec): Promise<unknown>;
}