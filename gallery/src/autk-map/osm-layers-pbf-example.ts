import { AutkMap } from '@urban-toolkit/autk-map';
import { AutkDb } from '@urban-toolkit/autk-db';
import { onExampleDispose } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;
const cityDatabase = new AutkDb();
let databaseReady = false;

/** Shared local city data for the flat, imagery, and terrain comparisons. */
export class OsmLayersApi {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = cityDatabase;
        if (!databaseReady) { await this.db.init(); databaseReady = true; }
        const clipped = new URLSearchParams(location.search).get('extent') === 'clipped';
        await this.db.setWorkspace(clipped ? 'city_clipped' : 'city_full');
        if (!this.db.getLayersMetadata().length) await this.db.loadOsm({
            pbfFileUrl: `${BASE_URL}data/niteroi.osm.pbf`,
            queryArea: { bbox: clipped ? [-43.13, -22.95, -43.08, -22.88] : [-43.14, -22.97, -43.03, -22.85] },
            autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
        });
        this.map = new AutkMap(canvas);
        onExampleDispose(() => this.map.destroy());
        await this.map.init();
        this.map.setView({ center: { latitude: -22.9, longitude: -43.1 }, zoom: 13 });
        await this.loadLayers();
        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layer of this.db.getLayersMetadata()) {
            const collection = await this.db.getLayer(layer.name);
            this.map.loadCollection(layer.name, { collection, type: layer.type, loadConfig: { buildingsZeroHeight: true } });
        }
        this.map.ui.setAttribution([{ text: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }]);
    }
}
