import { ComputeAdapter, ComputeSpec } from 'urban-grammar';
import { AutkSpatialDb } from '@urban-toolkit/autk-db';
import { AutkComputeEngine } from '@urban-toolkit/autk-compute';
import { FeatureCollection } from 'geojson';
import { ComputeCache } from '../types';

export function createComputeAdapter(cache?: ComputeCache): ComputeAdapter {

    return {
        async resolveCompute(context: AutkSpatialDb | undefined, spec: ComputeSpec): Promise<AutkSpatialDb | undefined> {
            if(context){
                const geojson: FeatureCollection = await context.getLayer(spec.dataRef);
                const engine = new AutkComputeEngine();

                const result = await engine.gpgpuPipeline({
                    collection: geojson,
                    variableMapping: spec.attributes,
                    wgslBody: spec.wglsFunction,
                    ...(spec.outputColumnName && { resultField: spec.outputColumnName }),
                    ...(spec.outputColumns   && { outputColumns: spec.outputColumns }),
                    ...(spec.attributeArrays  && { attributeArrays: spec.attributeArrays }),
                    ...(spec.attributeMatrices && { attributeMatrices: spec.attributeMatrices }),
                    ...(spec.uniforms         && { uniforms: spec.uniforms }),
                    ...(spec.uniformArrays    && { uniformArrays: spec.uniformArrays }),
                    ...(spec.uniformMatrices  && { uniformMatrices: spec.uniformMatrices }),
                });

                if (cache) cache.set(spec.dataRef, result);

                return context;
            }
        }
    }
}
