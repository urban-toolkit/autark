import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import {
    ColorMapDomainStrategy,
    ColorMapInterpolator,
} from '@urban-toolkit/autk-core';

const URL = (import.meta as any).env.BASE_URL;

export class ColormapCat {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadGeojson({
            geojsonFileUrl: `${URL}data/mnt_roads.geojson`,
            outputTableName: 'roads',
        });

        this.map = new AutkMap(canvas);
        this.map.style.setPredefinedStyle('light');

        await this.map.init();
        await this.loadLayers();
        await this.updateThematicData('roads');

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayersMetadata()) {
            const collection = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection, type: layerData.type });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(layer: string = 'neighborhoods'): Promise<void> {
        const geojson = await this.db.getLayer(layer);

        geojson.features.forEach((feature: any) => {
            const highway = feature?.properties?.highway;
            feature.properties = feature.properties ?? {};
            feature.properties.compute = feature.properties.compute ?? {};
            feature.properties.compute.highwayGroup = ['primary', 'secondary'].includes(highway) ? highway : 'other';
        });

        this.map.updateColorMap(layer, { colorMap: {
                interpolator: ColorMapInterpolator.CAT_OBSERVABLE10,
                domainSpec: { type: ColorMapDomainStrategy.USER, params: ['primary', 'secondary', 'other'] },
            }, });
        this.map.updateThematic(layer, { collection: geojson, property: 'properties.compute.highwayGroup' });
    }

}

async function main() {   
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new ColormapCat();
    await example.run(canvas);
}
void runExample(main);
