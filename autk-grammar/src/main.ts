import { DataAdapter, IEngine, MapAdapter, UrbanSpec, createEngine } from "urban-grammar";
import { createDataAdapter } from "./adapters/data";
import { createMapAdapter } from "./adapters/map";
import { Targets } from "./types";

export class AutkGrammar {
    private dataAdapter?: DataAdapter;
    private mapAdapter?: MapAdapter;
    private grammarEngine?: IEngine; 

    constructor(targets?: Targets) {
        this.dataAdapter = createDataAdapter(targets);
        this.mapAdapter = createMapAdapter(targets);
    }

    async run(spec: UrbanSpec) {
        if(!this.dataAdapter)
            throw new Error('Database adapter not initialized. Please call the constructor first.');

        if(!this.mapAdapter)
            throw new Error('Map engine not initialized. Please call the constructor first.');

        this.grammarEngine = createEngine({
            spec,
            adapters: {
                db: this.dataAdapter,
                map: this.mapAdapter
            }
        });

        await this.grammarEngine.run();
    }
}