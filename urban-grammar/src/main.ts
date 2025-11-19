import { IEngine } from "./interfaces";
import { UrbanSpec, EngineOptions, Table } from "./types";

export function createEngine(options: EngineOptions): IEngine{
    const { spec, adapters } = options;

    // TODO check if schema is respected

    async function run() {
        let tables: Table[] = [];
        
        // Database module
        if(spec.data)
            for(const source of spec.data) {
                tables = await adapters.db.resolveSource(source);
            }

        if(spec.map){
            if(tables.length > 0){
                await adapters.map.resolveMap(tables, spec.map);
            }else{
                throw new Error("Not enough tables loaded: 0");
            }
        }

        // TODO: Compute module, DB module, Map module, Plot module
    }

    function updatedSpec(spec: UrbanSpec) {
        console.log("Spec to update", spec);
        // TODO
        return new Promise<void>((resolve, _) => {
            resolve();
        });
    }

    function destroy() {
        // TODO
        console.log("Function not implemented yet");
    }

    return { run, updatedSpec, destroy };
}

