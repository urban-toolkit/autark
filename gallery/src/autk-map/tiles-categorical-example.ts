import { AutkDb } from '@urban-toolkit/autk-db';
import { TilesBasemap } from './tiles-example';
import { colorRoadCategories } from './numeric-road-colors';

const BASE_URL = (import.meta as ImportMeta & { env: { BASE_URL: string } }).env.BASE_URL;

/** Real database-loaded roads use the same default workspace CRS as the tile layer. */
export class TilesCategoricalExample extends TilesBasemap {
    protected override showStatistics = false;
    protected override showOpacity = false;
    protected override async loadLayers(): Promise<void> {
        const db = new AutkDb();
        await db.init();
        await db.loadGeojson({ geojsonFileUrl: `${BASE_URL}data/mnt_roads.geojson`, outputTableName: 'roads' });
        const collection = await db.getLayer('roads');
        this.map.loadCollection('roads', { collection, type: 'roads' });
        colorRoadCategories(this.map, collection);
        // Keep category colors readable at the whole-city overview scale.
        this.map.updateRenderInfo('roads', { renderInfo: { polylinesWidth: 35 } });
    }
}
