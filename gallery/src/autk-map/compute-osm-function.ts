import { AutkSpatialDb } from 'autk-db';
import { ComputeGpgpu } from 'autk-compute';

import { AutkMap, LayerType } from 'autk-map';

import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export class ComputeOsm {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    protected result!: FeatureCollection<Geometry, GeoJsonProperties>;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads'] as Array<'surface' | 'parks' | 'water' | 'roads'>,
                dropOsmTable: true,
            },
        });

        const geojsonCompute = new ComputeGpgpu();
        this.result = await geojsonCompute.run({
            collection:  await this.db.getLayer('table_osm_roads'),
            variableMapping: {
                x: 'lanes',
            },
            resultField: 'result',
            wgslBody: `
                if (x <= 0) {
                    return 1;
                }
                return x;
            `,
        });

        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();
        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateThematic('table_osm_roads', { collection: this.result, property: 'properties.compute.result' });
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new ComputeOsm();
    await example.run(canvas);
}
main();
