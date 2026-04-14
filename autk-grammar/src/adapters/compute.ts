import { ComputeAdapter, ComputeSpec } from 'urban-grammar';
import { SpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';
import { FeatureCollection } from 'geojson';

export function createComputeAdapter(): ComputeAdapter {

    return {
        async resolveCompute(context: SpatialDb | undefined, spec: ComputeSpec): Promise<SpatialDb | undefined> {
            if(context){
                console.log("Tables: ", context.tables);

                const geojson: FeatureCollection = await context.getLayer(spec.dataRef);
                const geojsonCompute = new GeojsonCompute();

                let {dataRef, ...rest_spec} = spec;

                let new_geojson: FeatureCollection = await geojsonCompute.computeFunctionIntoProperties({
                    geojson,
                    ...rest_spec
                });

                console.log("Computed GeoJSON: ", new_geojson);

                // Update context with new geojson TODO: pass layers current type
                await context.loadCustomLayer({
                    geojsonObject: new_geojson,
                    outputTableName: spec.dataRef
                });

                return context;
            }
        }   
    }
}