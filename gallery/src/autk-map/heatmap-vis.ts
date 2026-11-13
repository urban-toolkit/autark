import { runExample } from '../example';
// TODO: filter CSV data based on the osm data polygon.

import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class Heatmap {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadOsm({
            pbfFileUrl: `${URL}data/lower_mnt.osm.pbf`,
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                layers: ['surface', 'parks', 'water', 'roads'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
            },
        });

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: true,
        });

        console.log('Building heatmap...');
        await this.db.buildHeatmap({
            tableJoinName: 'noise',
            near: { distance: 1000 },
            outputTableName: 'heatmap',
            grid: {
                rows: 20,
                columns: 20,
            },
            groupBy: [
                {
                    column: 'Unique Key',
                    aggregateFn: 'count'
                },
            ],
        });


        const canvas = document.querySelector('canvas');
        if (canvas) {
            this.map = new AutkMap(canvas);

            await this.map.init();
            await this.loadLayers();
            this.map.draw();
        }
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of [...this.db.getLayersMetadata(), ...this.db.getRastersMetadata()]) {
            const geojson = layerData.type === 'raster'
                ? await this.db.getRaster(layerData.name)
                : await this.db.getLayer(layerData.name);

            const propertyPath = layerData.type === 'raster' ? 'band_1' : undefined;

            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type, property: propertyPath });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateRenderInfo('heatmap', { opacity: 0.5 });
    }
}

async function main() {
    const example = new Heatmap();
    await example.run();
}
void runExample(main);
