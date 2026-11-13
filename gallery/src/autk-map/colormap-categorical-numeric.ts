import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { colorRoadCategories } from './numeric-road-colors';

const BASE_URL = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

export class ColormapCategoricalNumeric {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();
        await this.db.loadGeojson({
            geojsonFileUrl: `${BASE_URL}data/mnt_roads.geojson`,
            outputTableName: 'roads',
        });

        this.map = new AutkMap(canvas);
        this.map.style.setPredefinedStyle('light');
        await this.map.init();

        for (const layerData of this.db.getLayersMetadata()) {
            const collection = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection, type: layerData.type });
        }

        const collection = await this.db.getLayer('roads');
        colorRoadCategories(this.map, collection);
        this.map.draw();
    }
}

async function main(): Promise<void> {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found');

    const status = document.querySelector<HTMLElement>('#map-status');
    const stage = document.querySelector<HTMLElement>('.map-stage');
    try {
        await new ColormapCategoricalNumeric().run(canvas);
        if (status) status.textContent = 'Interactive map';
    } catch (error) {
        if (status) {
            status.textContent = 'Unable to load map.';
            status.dataset.state = 'error';
        }
        console.error('Unable to initialize the numeric categorical example:', error);
    } finally {
        stage?.setAttribute('aria-busy', 'false');
    }
}

main();
