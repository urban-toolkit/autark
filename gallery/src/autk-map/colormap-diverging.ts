import { AutkSpatialDb } from 'autk-db';
import { AutkMap, ColorMapDomainStrategy, ColorMapInterpolator, LayerType } from 'autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class ColormapDiv {
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

        this.map = new AutkMap(canvas);

        await this.map.init();
        await this.loadLayers();
        await this.updateThematicData();

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(layer: string = 'neighborhoods'): Promise<void> {
        const geojson = await this.db.getLayer(layer);
        this.map.updateColorMap(layer, { colorMap: {
                interpolator: ColorMapInterpolator.DIV_RED_BLUE,
                domainSpec: { type: ColorMapDomainStrategy.MIN_MAX },
            }, });
        this.map.updateThematic(layer, { collection: geojson, property: 'properties.shape_area' });
    }

}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new ColormapDiv();
    await example.run(canvas);
}
main();
