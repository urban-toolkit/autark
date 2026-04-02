import { AutkSpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';

import { AutkMap, LayerType } from 'autk-map';

import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export class ComputeFunction {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
        });

        await this.db.loadCsv({
            csvFileUrl: 'http://localhost:5173/data/noise.csv',
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        let geojson = await this.db.getLayer('neighborhoods');

        const geojsonCompute = new GeojsonCompute();
        geojson = await geojsonCompute.analytical({
            collection: geojson,
            variableMapping: {
                x: 'shape_area',
                y: 'shape_leng',
            },
            resultField: 'result',
            wgslBody: 'return x / y;',
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
            this.map.loadCollection({ id: layerData.name, collection: geojson, type: layerData.type as LayerType });

            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(geojson: FeatureCollection<Geometry, GeoJsonProperties>) {
        const getFnv = (item: any) => {
            const feature = item as Feature;
            const properties = feature.properties as GeoJsonProperties;

            return properties?.compute.result || 0;
        };

        this.map.updateThematic({ id: 'neighborhoods', collection: geojson, getFnv });
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new ComputeFunction();
    await example.run(canvas);
}
main();
