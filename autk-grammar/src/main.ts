import { DbAdapter, IEngine, UrbanSpec, createEngine } from "urban-grammar";
import { createDbAdapter } from "./adapters/db";
import { Targets } from "./types";

export class AutkGrammar {
    private dbAdapter?: DbAdapter;
    private grammarEngine?: IEngine; 

    constructor(targets?: Targets) {
        this.dbAdapter = createDbAdapter(targets);
    }

    async run(spec: UrbanSpec) {
        if(!this.dbAdapter)
            throw new Error('Database adapter not initialized. Please call the constructor first.');

        this.grammarEngine = createEngine({
            spec,
            adapters: {
                db: this.dbAdapter
            }
        });

        await this.grammarEngine.run();
    }
}