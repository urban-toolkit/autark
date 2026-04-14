import { DataAdapter, MapAdapter, PlotAdapter, ComputeAdapter, IEngine, UrbanSpec, createEngine } from "urban-grammar";
import { createDataAdapter } from "./adapters/data";
import { createMapAdapter } from "./adapters/map";
import { createPlotAdapter } from "./adapters/plot";
import { createComputeAdapter } from "./adapters/compute";
import { Targets } from "./types";

export class AutkGrammar {
    private dataAdapter?: DataAdapter;
    private mapAdapter?: MapAdapter;
    private plotAdapter?: PlotAdapter;
    private computeAdapter?: ComputeAdapter;
    private grammarEngine?: IEngine; 

    constructor(targets?: Targets) {
        this.dataAdapter = createDataAdapter(targets);
        this.mapAdapter = createMapAdapter(targets);
        this.plotAdapter = createPlotAdapter(targets);
        this.computeAdapter = createComputeAdapter();
    }

    async run(spec: UrbanSpec) {
        if(!this.dataAdapter)
            throw new Error('Database adapter not initialized. Please call the constructor first.');

        if(!this.mapAdapter)
            throw new Error('Map engine not initialized. Please call the constructor first.');

        if(!this.plotAdapter)
            throw new Error('Plot adapter not initialized. Please call the constructor first.');

        if(!this.computeAdapter)
            throw new Error('Compute adapter not initialized. Please call the constructor first.');

        this.grammarEngine = createEngine({
            spec,
            adapters: {
                db: this.dataAdapter,
                map: this.mapAdapter,
                plot: this.plotAdapter,
                compute: this.computeAdapter
            }
        });

        await this.grammarEngine.run();
    }
}