import { PlotSpec } from "../types";

export interface PlotAdapter {
    resolvePlot(context: unknown, spec: PlotSpec): Promise<unknown>;
}