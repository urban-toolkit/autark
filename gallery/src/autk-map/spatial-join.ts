import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-map';

const URL = (import.meta as any).env.BASE_URL;


export class SpatialJoin {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: `${URL}data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
        });

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: true
        });

        await this.db.spatialQuery({
            tableRootName: 'neighborhoods',
            tableJoinName: 'noise',
            spatialPredicate: 'INTERSECT',
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
        await this.updateThematicData();

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
main();
