import { IEngine } from "./interfaces";
import { AutkSpec, EngineOptions } from "./types";

export function createEngine(options: EngineOptions): IEngine{
    const { spec, targets, adapters } = options;

    async function run() {
        // Database module
        const tables = new Map<string, unknown>();
        for(const source of spec.data) {
            const table = await adapters.db.resolveSource(source);
            tables.set(source.outputTableName, table);
        }
        // TODO: Compute module, DB module, Map module, Plot module
    }

    function updatedSpec(spec: AutkSpec) {
        // TODO
        return new Promise<void>((resolve, reject) => {
            resolve();
        });
    }

    function destroy() {
        // TODO
        console.log("Function not implemented yet");
    }

    return { run, updatedSpec, destroy };
}

