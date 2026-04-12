import { AutkSpatialDb } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';

const URL = (import.meta as any).env.BASE_URL;


export class SpatialJoin {
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

        const CSVs = ['noise', 'parking'];

        for (const csv of CSVs) {
        await this.db.loadCsv({
            csvFileUrl: `${URL}data/${csv}.csv`,
            outputTableName: csv,
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        await this.db.spatialQuery({
            tableRootName: 'neighborhoods',
            tableJoinName: csv,
            spatialPredicate: 'INTERSECT',
            output: {
                type: 'MODIFY_ROOT',
            },
            joinType: 'LEFT',
            groupBy: {
                selectColumns: [
                    {
                        tableName: csv,
                        column: 'Unique Key',
                        aggregateFn: 'count',
                    },
                ],
            },
        });

        }

        this.map = new AutkMap(canvas);
        await this.map.init();

        await this.loadLayers();
        await this.updateThematicData('noise');

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const collection = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(property: string) {
        const geojson = await this.db.getLayer('neighborhoods');

        this.map.updateThematic('neighborhoods', { collection: geojson,
            property: `properties.sjoin.count.${property}`, });
    }

    uiUpdate() {
        document.querySelector('select')?.addEventListener('change', async (event) => {
            const select = event.target as HTMLSelectElement;
            const value = select.value;

            this.updateThematicData(value);
        });
    }
}

async function main() {
    const example = new SpatialJoin();

    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    await example.run(canvas);
    example.uiUpdate();
}

main();
