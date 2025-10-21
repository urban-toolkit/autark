import { SpatialDb } from 'autk-db';
import { AutkMap, ColorMapInterpolator, LayerType } from 'autk-map';
import { Feature, GeoJsonProperties } from 'geojson';

export class GeojsonVis {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
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
            this.map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(layer: string = 'neighborhoods', groupById: boolean = false): Promise<void> {
        const geojson = await this.db.getLayer(layer);
        console.log({ geojson })

        const getFnv = (feature: Feature): number => {
            const properties = feature.properties as GeoJsonProperties;
            return +properties?.shape_area || 0;
        };

        this.map.updateRenderInfoProperty(layer, 'colorMapInterpolator', ColorMapInterpolator.DIVERGING_RED_BLUE);
        this.map.updateGeoJsonLayerThematic(layer, geojson, getFnv, groupById);
    }

}

async function main() {
    const example = new GeojsonVis();

    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    await example.run(canvas);
}
main();
