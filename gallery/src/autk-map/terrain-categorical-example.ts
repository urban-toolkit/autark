import { AutkDb } from '@urban-toolkit/autk-db';
import { TERRAIN_TILE_SOURCES } from '@urban-toolkit/autk-map';
import { TerrainTiles } from './terrain-example';
import { colorRoadCategories } from './numeric-road-colors';

const BASE_URL = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

/** The categorical tile example extended with Rio roads and streamed terrain. */
export class TerrainCategoricalExample extends TerrainTiles {
    protected override showStatistics = false;
    protected override showOpacity = false;
    protected override terrainSource = { ...TERRAIN_TILE_SOURCES.awsTerrarium,
        attribution: [...TERRAIN_TILE_SOURCES.awsTerrarium.attribution,
            { text: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }],
    };

    protected override async loadLayers(): Promise<void> {
        const db = new AutkDb();
        await db.init();
        await db.loadGeojson({ geojsonFileUrl: `${BASE_URL}data/rio_roads.geojson`, outputTableName: 'roads' });
        const collection = await db.getLayer('roads');
        this.map.loadCollection('roads', { collection, type: 'roads' });
        colorRoadCategories(this.map, collection, highway => {
            const road = typeof highway === 'string' ? highway.replace(/_link$/, '') : '';
            return ['motorway', 'trunk', 'primary'].includes(road) ? 3 : road === 'secondary' ? 1 : 2;
        });
        this.map.updateRenderInfo('roads', { renderInfo: { polylinesWidth: 20 } });
    }
}
