// TODO: filter CSV data based on the osm data polygon.

import { Feature, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';

export class GeojsonVis {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        const boundingBox = await this.db.getOsmBoundingBox();
        const heatMapFake = {
            type: 'FeatureCollection',
            bbox: [boundingBox.minLon, boundingBox.minLat, boundingBox.maxLon, boundingBox.maxLat],
            features: [
                {
                    type: 'Feature',
                    properties: {
                        raster: Array.from({ length: 256 * 256 }, (_d, k) => k),
                        rasterResX: 256,
                        rasterResY: 256,
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: [],
                    },
                },
            ],  
        }

        const canvas = document.querySelector('canvas');
        if (canvas) {
            this.map = new AutkMap(canvas);

            await this.map.init();
            await this.loadLayers();

            await this.map.loadGeoTiffLayer(
                'heatmap',
                heatMapFake as any,
                LayerType.AUTK_RASTER,
            );

            this.map.updateRenderInfoProperty('heatmap', 'opacity', 0.5);
            this.map.draw();
        }
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateRenderInfoProperty('neighborhoods', 'opacity', 0.75);
    }

    protected async updateThematicData() {
        const geojson = await this.db.getLayer('table_grid');

        const getFnv = (feature: Feature) => {
            const properties = feature.properties as GeoJsonProperties;
            return properties?.sjoin.count.parking || 0;
        };

        this.map.updateGeoJsonLayerThematic('table_grid', geojson, getFnv);
    }
}

async function main() {
    const example = new GeojsonVis();
    await example.run();
}
main();
