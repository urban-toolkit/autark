import { AutkMap } from '@urban-toolkit/autk-map';
import { AutkDb } from '@urban-toolkit/autk-db';

export class GeotiffVis {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadOsm({
            pbfFileUrl: '/data/lower_mnt.osm.pbf',
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            autoLoadLayers: {
                layers: ['surface', 'parks', 'water', 'roads']
            },
        });

        await this.db.loadGeoTiff({
            geotiffFileUrl: '/data/lower_mnt_dem.tif',
            outputTableName: 'lower_mnt_dem',
            coordinateFormat: 'EPSG:3857',
        });

        this.map = new AutkMap(canvas);

        await this.map.init();
        await this.loadLayers();

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of [...this.db.getLayersMetadata(), ...this.db.getRastersMetadata()]) {
            // getLayer preserves a GeoTIFF's own extent even after OSM establishes workspace bounds.
            const geojson = await this.db.getLayer(layerData.name);

            const propertyPath = layerData.type === 'raster' ? 'band_1' : undefined;

            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type, property: propertyPath });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new GeotiffVis();
    await example.run(canvas);
}
main();
