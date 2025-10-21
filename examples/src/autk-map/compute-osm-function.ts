import { SpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';

import { AutkMap, LayerType } from 'autk-map';

import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export class SpatialJoin {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
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
                layers: ['surface', 'parks', 'water', 'roads'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });

        let geojson = await this.db.getLayer('table_osm_roads');

        const geojsonCompute = new GeojsonCompute();
        geojson = await geojsonCompute.computeFunctionIntoProperties({
            geojson,
            variableMapping: {
                x: 'lanes',
            },
            outputColumnName: 'result',
            wglsFunction: `
                if (x <= 0) {
                    return 1;
                }
                return x;
            `,
        });

        this.map = new AutkMap(canvas);
        await this.map.init();

        await this.loadLayers();
        await this.updateThematicData(geojson);

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(geojson: FeatureCollection<Geometry, GeoJsonProperties>) {
        const getFnv = (feature: Feature) => {
            const properties = feature.properties as GeoJsonProperties;

            return properties?.compute.result || 0;
        };


        this.map.updateGeoJsonLayerThematic('table_osm_roads', geojson, getFnv);
    }
}

async function main() {
    const example = new SpatialJoin();

    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    await example.run(canvas);
}
main();
