import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { ComputeGpgpu } from '@urban-toolkit/autk-compute';

import { AutkMap } from '@urban-toolkit/autk-map';

import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export class ComputeOsm {
    protected map!: AutkMap;
    protected db!: AutkDb;

    protected result!: FeatureCollection<Geometry, GeoJsonProperties>;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadOsm({
            pbfFileUrl: `${(import.meta as any).env.BASE_URL}data/lower_mnt.osm.pbf`,
            queryArea: { bbox: [-74.019, 40.700, -74.003, 40.714] },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                layers: ['surface', 'parks', 'water', 'roads'] as Array<'surface' | 'parks' | 'water' | 'roads'>,
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
        for (const layerData of this.db.getLayersMetadata()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type });
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
void runExample(main);
