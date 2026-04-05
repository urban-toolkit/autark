import { AutkSpatialDb } from 'autk-db';
import {
    AutkMap,
    ColorMapDomainStrategy,
    ColorMapInterpolator,
    LayerType,
    MapStyle 
} from 'autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class ColormapCat {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: `${URL}data/mnt_roads.geojson`,
            outputTableName: 'roads',
            coordinateFormat: 'EPSG:3395'
        });

        this.map = new AutkMap(canvas);
        MapStyle.setPredefinedStyle('light');

        await this.map.init();
        await this.loadLayers();
        await this.updateThematicData('roads');

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const collection = await this.db.getLayer(layerData.name);
            this.map.loadCollection({ id: layerData.name, collection, type: layerData.type as LayerType });
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

        this.map.updateColorMap({
            id: layer,
            colorMap: {
                interpolator: ColorMapInterpolator.OBSERVABLE10,
                domainSpec: { type: ColorMapDomainStrategy.USER, params: ['primary', 'secondary', 'other'] },
            },
        });
        this.map.updateThematic({ id: layer, collection: geojson, property: 'properties.compute.highwayGroup' });
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
main();
