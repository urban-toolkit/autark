import { PlotAdapter, PlotSpec } from 'urban-grammar';
import { Targets } from '../types';

export function createPlotAdapter(targets?: Targets): PlotAdapter {

    return {
        async resolvePlot(context: unknown, spec: PlotSpec): Promise<void> {
            console.log("Context", context);
            console.log("Spec", spec);
            console.log("Targets", targets);

            // TODO: Implement
            throw new Error("Plot adapter not implemented yet.");
        }   
    }
}