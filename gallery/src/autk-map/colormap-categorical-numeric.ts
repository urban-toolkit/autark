import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';

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
        for (const feature of collection.features) {
            const highway = feature.properties?.highway;
            feature.properties = {
                ...feature.properties,
                highwayGroup: highway === 'primary' ? 3 : highway === 'secondary' ? 1 : 2,
            };
        }

        // The category order deliberately differs from numeric order and uses no zero label.
        this.map.updateColorMap('roads', { colorMap: {
            interpolator: ColorMapInterpolator.CAT_OBSERVABLE10,
            domainSpec: { type: ColorMapDomainStrategy.USER, params: [3, 1, 2] },
        } });
        this.map.updateThematic('roads', { collection, property: 'properties.highwayGroup' });
        this.map.updateRenderInfo('roads', { isColorMap: true });
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
