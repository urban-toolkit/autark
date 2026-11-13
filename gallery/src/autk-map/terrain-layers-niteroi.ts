import { runExample } from '../example';
import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';

const URL = (import.meta as any).env.BASE_URL;
const ELEVATION_LAYER_ID = 'niteroi_elevation';

export class TerrainLayersNiteroi {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        // `?offline` skips the Overpass request, which can be slow. The elevation and the
        // buildings are bundled, so the terrain and the imagery still load (no roads, water or parks).
        const offline = new URLSearchParams(window.location.search).has('offline');
        if (!offline) {
            await this.db.loadOsm({
                queryArea: {
                    geocodeArea: 'Rio de Janeiro',
                    areas: ['Niterói'],
                },
                outputTableName: 'table_osm',
                autoLoadLayers: {
                    layers: [
                        // No 'surface' layer: it would be drawn over the imagery below.
                        'parks',
                        'water',
                        'roads'
                    ] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                },
            });
        }

        await this.db.loadGeoTiff({
            geotiffFileUrl: `${URL}data/niteroi-elevation.tif`,
            coordinateFormat: 'EPSG:3395',
            outputTableName: ELEVATION_LAYER_ID,
        });

        console.log(`Loaded GeoTIFF table: ${ELEVATION_LAYER_ID}`);

        await this.db.loadGeojson({
            geojsonFileUrl: `${URL}data/nit_buildings.geojson`,
            outputTableName: 'lots',
            layerType: 'buildings',
        });

        this.map = new AutkMap(canvas);

        await this.map.init();
        await this.loadLayers();

        // Imagery sits under every other layer and is draped over the terrain with them.
        this.map.loadTiles('imagery', { source: TILE_SOURCES.esriWorldImagery });

        const elevation = await this.db.getRaster(ELEVATION_LAYER_ID);
        this.map.loadTerrain({ source: { collection: elevation, property: 'band_1' } });

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayersMetadata()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, {
                collection: geojson,
                type: layerData.type,
                loadConfig: { buildingsZeroHeight: true },
            });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }
    
    const example = new TerrainLayersNiteroi();
    await example.run(canvas);
}
void runExample(main);
