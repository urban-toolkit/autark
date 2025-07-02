import { SpatialDb } from 'utkdb';
import { UtkMap, LayerType } from 'utkmap';

export class GeojsonVis {
    protected map!: UtkMap;
    protected db!: SpatialDb;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        // Reads a local GeoJSON file
        const geoJsonFile = await fetch('http://localhost:5173/data/mnt_neighs.geojson');
        console.log("Loaded GeoJSON file:", geoJsonFile);

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
        });

        const boundingBox = await this.db.getBoundingBoxFromLayer('neighborhoods');
        console.log("Bounding Box:", boundingBox);

        const canvas = document.querySelector('canvas');

        if (canvas) {
            canvas.width = canvas.height = canvas.parentElement?.clientHeight || 800;
            this.map = new UtkMap(canvas);

            await this.map.init(boundingBox);
            await this.loadLayers();

            this.map.draw();
        }
    }

    protected async loadLayers(): Promise<void> {
        const data = [];
        for (const layerData of this.db.tables) {

            if (layerData.source === 'csv') {
                continue;
            }

            const geojson = await this.db.getLayer(layerData.name);
            data.push({ props: layerData, data: geojson });
        }

        for (const json of data) {
            console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
            this.map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
        }
    }
}

async function main() {
    const example = new GeojsonVis();
    await example.run();
}
main();
