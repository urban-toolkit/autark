import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const URL = (import.meta as any).env.BASE_URL;


export class SpatialJoinNear {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: true,
        });

        const layer = 'table_osm_buildings';

        await this.db.spatialQuery({
            tableRootName: layer,
            tableJoinName: 'noise',
            spatialPredicate: 'NEAR',
            nearDistance: 1000,
            groupBy: {
                selectColumns: [
                    {
                        column: 'Unique Key',
                        aggregateFn: 'count',
                    },
                ],
            },
        });

        this.map = new AutkMap(canvas);
        await this.map.init();

        await this.loadLayers();
        await this.updateThematicData(layer);

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);

            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type });
            this.map.updateRenderInfo(layerData.name, { isSkip: layerData.source === 'csv' });

            console.log(`Loading layer: ${layerData.name} from ${layerData.source} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(layer: string = 'table_osm_buildings') {
        const geojson = await this.db.getLayer(layer);

        this.map.updateThematic(layer, { collection: geojson, property: 'properties.sjoin.count.noise' });
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {  
        throw new Error('No canvas found');
    }

    const example = new SpatialJoinNear();
    await example.run(canvas);
}
main();
