import { IEngine } from "./interfaces";
import { UrbanSpec, EngineOptions } from "./types";

export function createEngine(options: EngineOptions): IEngine{
    const { spec, adapters } = options;

    // TODO check if schema is respected

    async function run() {
        let context: unknown;
        
        // Database module
        if(spec.data)
            for(const source of spec.data) {
                context = await adapters.db.resolveSource(source);
            }

        if(spec.map){
            await adapters.map.resolveMap(context, spec.map);
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

