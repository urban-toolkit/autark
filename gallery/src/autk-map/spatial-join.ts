import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';

const URL = (import.meta as any).env.BASE_URL;


export class SpatialJoin {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        console.log(`[autk-db] init...`);
        this.db = new AutkDb();
        await this.db.init();

        console.log(`[autk-db] Loading neighborhoods geojson...`);
        await this.db.loadGeojson({
            geojsonFileUrl: `${URL}data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
        });

        console.log(`[autk-db] Loading noise csv...`);
        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: true
        });

        console.log(`[autk-db] Performing spatial join...`);
        await this.db.spatialQuery({
            tableRootName: 'neighborhoods',
            tableJoinName: 'noise',
            groupBy: [
                {
                    column: 'Unique Key',
                    aggregateFn: 'count',
                },
            ],
        });

        console.log(`[autk-map] Init...`);
        this.map = new AutkMap(canvas);
        await this.map.init();

        await this.loadLayers();
        await this.updateThematicData();

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayersMetadata()) {
            const geojson = await this.db.getLayer(layerData.name);

            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type });
            this.map.updateRenderInfo(layerData.name, { isSkip: layerData.source === 'csv' });

            console.log(`[autk-map] Loading layer: ${layerData.name} from ${layerData.source} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData() {
        const geojson = await this.db.getLayer('neighborhoods');

        this.map.updateColorMap('neighborhoods', { colorMap: {
                domainSpec: { type: ColorMapDomainStrategy.MIN_MAX },
                interpolator: ColorMapInterpolator.SEQ_BLUES,
            }, });

        this.map.updateThematic('neighborhoods', { collection: geojson, property: 'properties.sjoin.count.noise' });
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
void runExample(main);
