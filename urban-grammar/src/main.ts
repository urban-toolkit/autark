import { IEngine } from "./interfaces";
import { UrbanSpec, EngineOptions } from "./types";

export function createEngine(options: EngineOptions): IEngine{
    const { spec, adapters } = options;

    // TODO check if schema is respected

    async function run() {
        let context: unknown;
        
        if(spec.data)
            for(const source of spec.data) {
                context = await adapters.db.resolveSource(context, source);
            }

        if(spec.compute)
            for(const compute of spec.compute) {
                context = await adapters.compute.resolveCompute(context, compute);
            }

        if(spec.map){
            if(Array.isArray(spec.map))
                for(let i = 0; i < spec.map.length; i++){
                    let map = spec.map[i];
                    await adapters.map.resolveMap(context, map, i);
                }
            else
                await adapters.map.resolveMap(context, spec.map);
        }

        if(spec.plot){
            await adapters.plot.resolvePlot(undefined, spec.plot);
        }
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

