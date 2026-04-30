import { AutkMap } from 'autk-map';
import { AutkSpatialDb } from 'autk-db';

const URL = (import.meta as any).env.BASE_URL;

export class OsmLayersApi {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'Rio de Janeiro',
                areas: ['Niterói'],
            }, outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: [
                    'surface',
                    'parks',
                    'water',
                    'roads'
                ] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });

        await this.db.loadCustomLayer({
            geojsonFileUrl: `${URL}data/nit_buildings.geojson`,
            outputTableName: 'lotes',
            coordinateFormat: 'EPSG:3395',
            layerType: 'buildings'
        });

        this.map = new AutkMap(canvas);

        await this.map.init();
        await this.loadLayers();

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type, allowZeroHeightBuildings: true });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new OsmLayersApi();
    await example.run(canvas);
}

main();
