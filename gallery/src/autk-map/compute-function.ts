import { AutkSpatialDb } from 'autk-db';
import { ComputeGpgpu } from 'autk-compute';

import { AutkMap, LayerType } from 'autk-map';

import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

const URL = (import.meta as any).env.BASE_URL;

export class ComputeFunction {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: `${URL}data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
        });

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        let geojson = await this.db.getLayer('neighborhoods');

        const geojsonCompute = new ComputeGpgpu();
        geojson = await geojsonCompute.exec({
            collection: geojson,
            variableMapping: {
                x: 'shape_area',
                y: 'shape_leng',
            },
            resultField: 'result',
            // The Isoperimetric Quotient (Compactness/Circularity) 
            wgslBody: 'return (4 * 3.1415927 * x) / (y * y);',
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
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });

            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(geojson: FeatureCollection<Geometry, GeoJsonProperties>) {
        this.map.updateThematic('neighborhoods', { collection: geojson, property: 'properties.compute.result' });
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
