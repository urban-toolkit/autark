import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap } from '@urban-toolkit/autk-map';
import { runExample, setExampleState } from '../example';

const BASE_URL = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;
const ELEVATION_LAYER_ID = 'niteroi_elevation';

/** Niterói surface and buildings with elevation from the bundled GeoTIFF. */
export class TerrainLayersNiteroi {
    protected map!: AutkMap;
    protected db!: AutkDb;
    private readonly onPageHide = () => this.dispose();

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        try {
            this.db = new AutkDb();
            await this.db.init();
            setExampleState('loading', 'Loading local OpenStreetMap data…');
            await this.db.loadOsm({
                pbfFileUrl: `${BASE_URL}data/niteroi.osm.pbf`,
                queryArea: { geocodeArea: 'Rio de Janeiro', areas: ['Niterói'] },
                outputTableName: 'table_osm',
                autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads'] },
            });
            setExampleState('loading', 'Loading local elevation…');
            await this.db.loadGeoTiff({
                geotiffFileUrl: `${BASE_URL}data/niteroi-elevation.tif`,
                coordinateFormat: 'EPSG:3395',
                outputTableName: ELEVATION_LAYER_ID,
            });
            setExampleState('loading', 'Loading local buildings…');
            await this.db.loadGeojson({
                geojsonFileUrl: `${BASE_URL}data/nit_buildings.geojson`,
                outputTableName: 'lots', layerType: 'buildings',
            });
            setExampleState('loading', 'Preparing terrain…');
            this.map = new AutkMap(canvas);
            await this.map.init();
            await this.loadLayers();
            this.map.fitBounds();
            const elevation = await this.db.getRaster(ELEVATION_LAYER_ID);
            this.map.loadTerrain({ source: { collection: elevation, property: 'band_1' } });
            this.map.ui.setAttribution([
                { text: 'Mapzen', url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md' },
                { text: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' },
            ]);
            this.map.draw();
            window.addEventListener('pagehide', this.onPageHide, { once: true });
        } catch (error) { this.dispose(); throw error; }
    }

    protected async loadLayers(): Promise<void> {
        for (const layer of this.db.getLayersMetadata()) {
            const collection = await this.db.getLayer(layer.name);
            this.map.loadCollection(layer.name, { collection, type: layer.type, loadConfig: { buildingsZeroHeight: true } });
        }
    }

    dispose(): void {
        window.removeEventListener('pagehide', this.onPageHide);
        this.map?.destroy();
    }
}

async function main(): Promise<void> {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found');
    await new TerrainLayersNiteroi().run(canvas);
}

void runExample(main);
