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
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                layers: ['surface', 'parks', 'water', 'roads'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
            },
        });

        console.log('Building heatmap...');
        await this.db.buildHeatmap({
            tableJoinName: 'noise',
            nearDistance: 1000,
            outputTableName: 'heatmap',
            grid: {
                rows: 20,
                columns: 20,
            },
            groupBy: {
                selectColumns: [
                    {
                        column: 'Unique Key',
                        aggregateFn: 'count'
                    },
                ],
            },
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
        const propertyPath = 'band_1';

        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);

            if (layerData.type === 'raster') {
                this.map.loadCollection(layerData.name, { collection: geojson, type: 'raster', property: propertyPath });
            }
            else {
                this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type });
            }
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateRenderInfo('heatmap', { opacity: 0.5 });
    }
}

async function main() {
    const example = new Heatmap();
    await example.run();
}
main();
