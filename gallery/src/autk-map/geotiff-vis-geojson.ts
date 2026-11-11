import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';

const URL = (import.meta as any).env.BASE_URL;

export class GeotiffVisGeojson {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadGeojson({
            geojsonFileUrl: `${URL}data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
        });

        await this.db.loadGeoTiff({
            geotiffFileUrl: '/data/mnt_dem.tif',
            outputTableName: 'mnt_dem',
            coordinateFormat: 'EPSG:3857',
        });

        const canvas = document.querySelector('canvas');
        if (canvas) {
            this.map = new AutkMap(canvas);

            await this.map.init();
            await this.loadLayers();
            this.map.draw();
        }
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of [...this.db.getLayersMetadata(), ...this.db.getRastersMetadata()]) {
            const geojson = layerData.type === 'raster'
                ? await this.db.getRaster(layerData.name)
                : await this.db.getLayer(layerData.name);

            const propertyPath = layerData.type === 'raster' ? 'band_1' : undefined;

            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type, property: propertyPath });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }
}

async function main() {
    const example = new GeotiffVisGeojson();
    await example.run();
}
void runExample(main);
