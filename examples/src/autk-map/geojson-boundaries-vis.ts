import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';

export class GeojsonVis {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        const response = await fetch('http://localhost:5173/data/mnt_neighs.geojson');
        const data = await response.json();

        await this.db.loadCustomLayer({
            geojsonObject: data,
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395',
            type: 'boundaries'
        });

        const boundingBox = await this.db.getBoundingBoxFromLayer('neighborhoods');

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
    const example = new GeojsonVis();
    await example.run();
}
main();
