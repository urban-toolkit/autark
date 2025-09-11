import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';

export class GeojsonLinesVis {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_roads.geojson',
            outputTableName: 'roads',
            coordinateFormat: 'EPSG:3395',
            type: 'lines'
        });

        const boundingBox = await this.db.getBoundingBoxFromLayer('roads');
        

        const canvas = document.querySelector('canvas');

        if (canvas) {
            this.map = new AutkMap(canvas);

            await this.map.init(boundingBox);
            await this.loadLayers();

            this.map.draw();
        }
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, layerData.type as LayerType, geojson);

            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateRenderInfoProperty('neighborhoods', 'opacity', 0.75);
    }
}

async function main() {
    const example = new GeojsonLinesVis();
    await example.run();
}
main();
