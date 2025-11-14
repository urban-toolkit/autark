import { DbAdapter, UrbanSpec, createEngine } from "urban-grammar";
import { createDbAdapter } from "./adapters/db";

export class AutkGrammar {
    private dbAdapter?: DbAdapter;

    init() {
        this.dbAdapter = createDbAdapter();
    }

    async compile(spec: UrbanSpec) {
        if(!this.dbAdapter)
            throw new Error('Database adapter not initialized. Please call init() first.');

        createEngine({
            spec,
            adapters: {
                db: this.dbAdapter
            }
        })
    }
}