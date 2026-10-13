import { AutkDb } from '@urban-toolkit/autk-db';
import { BAND_COUNT, NITEROI_AREA, NITEROI_PBF, ROADS_LAYER } from './config';

export class NiteroiData {
    public readonly db = new AutkDb();

    public async load(onProgress: (message: string, note?: string) => void): Promise<void> {
        onProgress('Initializing spatial database...');
        await this.db.init();
        onProgress('Loading local OSM PBF...', 'Reading Niterói with Rio de Janeiro coastline coverage.');
        await this.db.loadOsm({
            pbfFileUrl: `${import.meta.env.BASE_URL}data/${NITEROI_PBF}`,
            queryArea: NITEROI_AREA,
            outputTableName: 'table_osm',
            autoLoadLayers: { layers: ['surface', 'parks', 'water', 'roads'] },
        });
        onProgress('Loading temperature dataset...', 'Importing 24 annual temperature bands.');
        await this.db.loadGeoTiff({
            geotiffFileUrl: `${import.meta.env.BASE_URL}data/niteroi_lst_verao_2001_2024.tif`,
            outputTableName: 'lst',
        });
        onProgress('Joining LST to road segments...', 'Averaging bands within 1 km of each road.');
        await this.db.spatialQuery({
            tableRootName: ROADS_LAYER,
            tableJoinName: 'lst',
            near: { distance: 1000 },
            groupBy: Array.from({ length: BAND_COUNT }, (_, i) => ({
                column: `band_${i + 1}`, aggregateFn: 'avg' as const,
            })),
        });
        // Preserve the original example's zero-imputation policy (see README).
        const bands = Array.from({ length: BAND_COUNT }, (_, i) =>
            `COALESCE(json_extract(properties, '$.sjoin.avg."lst.band_${i + 1}"')::DOUBLE, 0)`
        ).join(', ');
        onProgress('Preparing temperature series...');
        await this.db.rawQuery({
            query: `SELECT geometry,
                json_merge_patch(COALESCE(CAST(properties AS JSON), '{}'::JSON),
                    json_object('lst_timeseries', [${bands}])) AS properties
                FROM ${ROADS_LAYER}`,
            output: { type: 'CREATE_TABLE', tableName: ROADS_LAYER, source: 'osm', tableType: 'roads' },
        });
    }
}
