import { ComputeAdapter, ComputeSpec } from 'urban-grammar';
import { SpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';
import { FeatureCollection } from 'geojson';
import { ComputeCache } from '../types';

export function createComputeAdapter(cache?: ComputeCache): ComputeAdapter {

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

                // Store in cache so the map adapter can access the computed data
                // without reloading into DuckDB (which would lose the original layer type)
                if (cache) cache.set(spec.dataRef, new_geojson);

                return context;
            }
        }
    }
}