import { MapAdapter, MapSpec } from 'urban-grammar';
import { Targets, MapRegistry, ComputeCache } from '../types';
import { AutkMap, MapStyle, LayerType } from 'autk-map';
import { SpatialDb } from 'autk-db';
import { Feature, GeoJsonProperties } from 'geojson';

function resolveFieldPath(properties: GeoJsonProperties, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = properties;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

export function createMapAdapter(targets?: Targets, registry?: MapRegistry, computeCache?: ComputeCache): MapAdapter {

    async function loadLayers(map: AutkMap, context: SpatialDb, spec: MapSpec): Promise<void> {
        // TODO: this information should be more easily available here. Maybe that is solved with a more solid shared context for the grammar.
        let tableToTypeMap: {[tableName: string]: LayerType | 'pointset'} = {};

        for(const table of context.tables) {
            tableToTypeMap[table.name] = table.type as (LayerType | 'pointset');
        }

        console.log("Table to type map", tableToTypeMap);
        console.log("Tables", context.tables);

        // Load layers
        for(const layerRef of spec.layerRefs){
            const name = layerRef.dataRef;
            const type = tableToTypeMap[name];
            const getFnv = layerRef.getFnv;
            const getFnvType = layerRef.getFnvType;
            const colorMapDomain = layerRef.colorMapDomain;
            const defaultFnv = layerRef.defaultFnv;

            const data = computeCache?.get(name) ?? await context.getLayer(name);

            if(type == LayerType.AUTK_RASTER) {
                const cellFn = getFnv
                    ? (cell: unknown) => {
                        const resolved = resolveFieldPath(cell as Record<string, unknown>, getFnv);
                        return resolved != null ? Number(resolved) : Number(defaultFnv ?? 0);
                    }
                    : (cell: unknown) => Number(cell);
                map.loadGeoTiffLayer(name, data, LayerType.AUTK_RASTER, cellFn);
            } else {
                map.loadGeoJsonLayer(name, data, type as LayerType);
            }

            console.log(`Loading layer: ${name} of type ${type}`);

            function _getFnv(feature: Feature): string | number {
                const properties = feature.properties as GeoJsonProperties;

                if (getFnv) {
                    const resolved = resolveFieldPath(properties, getFnv);
                    if (resolved != null) {
                        if (getFnvType === 'categorical') {
                            const str = String(resolved);
                            return colorMapDomain ? (colorMapDomain.includes(str) ? str : 'other') : str;
                        }
                        if (getFnvType === 'quantitative') return Number(resolved);
                        return resolved as string | number;
                    }
                    if (defaultFnv != undefined) return defaultFnv;
                    throw new Error(`Cannot access value "${getFnv}" in table "${name}". Value should exist in all rows or a defaultFnv should be set.`);
                }

                return '';
            };

            if(layerRef.opacity)
                map.updateRenderInfoProperty(name, 'opacity', layerRef.opacity);

            if(layerRef.colorMapInterpolator)
                map.updateRenderInfoProperty(name, 'colorMapInterpolator', layerRef.colorMapInterpolator);

            if(getFnv && type !== LayerType.AUTK_RASTER)
                map.updateGeoJsonLayerThematic(name, data, _getFnv, layerRef.normalization);
        }
    }

    return {
        async resolveMap(context: SpatialDb | undefined, spec: MapSpec, index: number = 0): Promise<void> {
            if(targets && targets.map && context){

                let canvas;

                if(Array.isArray(targets.map)){
                    canvas = document.getElementById(targets.map[index]);
                }else{
                    canvas = document.getElementById(targets.map);
                }

                if(!canvas)
                    throw new Error("Could not find rendering target for map: "+targets.map);

                if(!(canvas instanceof HTMLCanvasElement))
                    throw new Error("Target for map is not a canvas: "+targets.map);

                const map = new AutkMap(canvas);

                if(spec.style)
                    MapStyle.setPredefinedStyle(spec.style)

                await map.init();
                await loadLayers(map, context, spec);

                if(registry)
                    for(const layerRef of spec.layerRefs)
                        registry.set(layerRef.dataRef, map);

                map.draw();
            }
        }
    }
}