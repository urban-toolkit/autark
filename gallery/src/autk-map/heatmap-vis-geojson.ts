// TODO: filter CSV data based on the osm data polygon.

import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, LayerType } from '@urban-toolkit/autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class Heatmap {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

       await this.db.loadCustomLayer({
            geojsonFileUrl: `${URL}data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
        });

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
            },
        });

        await this.db.buildHeatmap({
            tableJoinName: 'noise',
            nearDistance: 1000,
            outputTableName: 'heatmap',
            grid: {
                rows: 30,
                columns: 30,
            },
            groupBy: {
                selectColumns: [
                    {
                        tableName: 'noise',
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
        const propertyPath = 'count.noise';

        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);

            if (layerData.type === 'raster') {
                this.map.loadCollection(layerData.name, { collection: geojson, type: 'raster', property: propertyPath });
            }
            else {
                this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
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
