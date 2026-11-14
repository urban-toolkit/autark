import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, TERRAIN_TILE_SOURCES } from '@urban-toolkit/autk-map';
import { runExample, setExampleState } from '../example';

const BASE_URL = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

/** Niterói surface and buildings with elevation streamed from Terrarium tiles. */
export class TerrainLayersNiteroiStreamed {
    protected map!: AutkMap;
    protected db!: AutkDb;
    private timer: ReturnType<typeof setInterval> | undefined;
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
            this.map.loadTerrain({ source: {
                ...TERRAIN_TILE_SOURCES.awsTerrarium,
                attribution: [...TERRAIN_TILE_SOURCES.awsTerrarium.attribution,
                    { text: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }],
            } });
            this.map.draw();
            this.refreshStatus();
            this.timer = setInterval(() => this.refreshStatus(), 250);
            window.addEventListener('pagehide', this.onPageHide, { once: true });
        } catch (error) { this.dispose(); throw error; }
    }

    protected async loadLayers(): Promise<void> {
        for (const layer of this.db.getLayersMetadata()) {
            const collection = await this.db.getLayer(layer.name);
            this.map.loadCollection(layer.name, { collection, type: layer.type, loadConfig: { buildingsZeroHeight: true } });
        }
    }

    refreshStatus(): void {
        const terrain = this.map.getTerrainTileStats();
        if (!terrain) return;
        // Before the first frame, the stream has not selected any tiles yet.
        const busy = !terrain.idle || terrain.wantedTiles === 0;
        const partial = !busy && !terrain.complete;
        const state = partial ? 'error' : busy ? 'loading' : 'ready';
        const text = partial ? 'Partial terrain coverage' : busy ? 'Loading elevation tiles…' : 'Interactive map';
        const status = document.querySelector<HTMLElement>('#map-status');
        if (status?.dataset.state !== state || status.textContent !== text) setExampleState(state, text);
    }

    dispose(): void {
        clearInterval(this.timer); this.timer = undefined;
        window.removeEventListener('pagehide', this.onPageHide);
        this.map?.destroy();
    }
}

const example = new TerrainLayersNiteroiStreamed();
let initialized = false;
void runExample(async () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found');
    await example.run(canvas);
    initialized = true;
}, true).then(() => { if (initialized) example.refreshStatus(); });
