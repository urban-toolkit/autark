import { ComputeSpec } from "../types";

export interface ComputeAdapter {
    resolveCompute(context: unknown, spec: ComputeSpec): Promise<unknown>;
}