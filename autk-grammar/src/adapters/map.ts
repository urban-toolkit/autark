import { MapAdapter, MapSpec } from 'urban-grammar';
import { Targets } from '../types';
import { AutkMap, MapStyle, LayerType } from 'autk-map';
import { SpatialDb } from 'autk-db';
import { Feature, GeoJsonProperties } from 'geojson';

export function createMapAdapter(targets?: Targets): MapAdapter {

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

            const data = await context.getLayer(name);

            if(type == LayerType.AUTK_RASTER)
                map.loadGeoTiffLayer(
                    'heatmap',
                    data,
                    LayerType.AUTK_RASTER,
                );
            else
                map.loadGeoJsonLayer(name, data, type as LayerType);

            console.log(`Loading layer: ${name} of type ${type}`);

            function _getFnv(feature: Feature): string | number {
                const properties = feature.properties as GeoJsonProperties;
                
                if(getFnv){

                    if(properties && properties.compute && properties.compute[getFnv])
                        return properties.compute[getFnv];

                    if(!properties || !properties[getFnv])
                        throw new Error(`Cannot access value ${getFnv} in table ${name}`);

                    return properties[getFnv];
                }

                return '';
            };

            if(layerRef.opacity)
                map.updateRenderInfoProperty(name, 'opacity', layerRef.opacity);

            if(layerRef.colorMapInterpolator)
                map.updateRenderInfoProperty(name, 'colorMapInterpolator', layerRef.colorMapInterpolator);
            
            if(getFnv)
                map.updateGeoJsonLayerThematic(name, data, _getFnv, layerRef.groupById);
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

                map.draw();
            }
        }
    }
}