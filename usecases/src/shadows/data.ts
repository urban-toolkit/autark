import { AutkDb } from '@urban-toolkit/autk-db';
import splitRoadsQuery from './split-roads.sql?raw';
import { MONTH_CONFIG, clearRoadsCompute } from './utils';
import { CHICAGO_AREA, CHICAGO_PBF } from './config';

export const ROADS_LAYER = 'table_roads_20m';
export const BUILDINGS_LAYER = 'table_osm_buildings';

export class ShadowsData {
    public readonly db = new AutkDb();

    public async load(onProgress: (message: string, note?: string) => void) {
        onProgress('Initializing spatial database...');
        await this.db.init();
        onProgress('Loading local OSM PBF...', 'Reading Chicago Loop and Near South Side.');
        await this.db.loadOsm({
            pbfFileUrl: `${import.meta.env.BASE_URL}data/${CHICAGO_PBF}`,
            queryArea: CHICAGO_AREA,
            outputTableName: 'table_osm',
            autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads', 'buildings'] },
        });
        onProgress('Loading shadow measurements...');
        await this.db.loadCsv({
            csvFileUrl: `${import.meta.env.BASE_URL}data/shadows_chicago.csv`,
            outputTableName: 'shadows',
            geometryColumns: { latColumnName: 'latitude', longColumnName: 'longitude' },
        });
        onProgress('Splitting roads into 20 m segments...');
        await this.db.rawQuery({
            query: splitRoadsQuery,
            output: { type: 'CREATE_TABLE', tableName: ROADS_LAYER, source: 'user', tableType: 'roads' },
        });
        onProgress('Joining monthly shadow measurements...', 'Averaging measurements within 200 m of each segment.');
        for (const { code } of MONTH_CONFIG) {
            await this.db.spatialQuery({
                tableRootName: ROADS_LAYER, tableJoinName: 'shadows', near: { distance: 200 },
                groupBy: [{ column: code, aggregateFn: 'avg' }],
            });
        }
        await this.db.removeLayer('shadows');
        const roads = await this.db.getLayer(ROADS_LAYER);
        clearRoadsCompute(roads);
        return { roads, buildings: await this.db.getLayer(BUILDINGS_LAYER) };
    }
}
