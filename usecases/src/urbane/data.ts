import type { FeatureCollection } from 'geojson';

import { AutkDb } from '@urban-toolkit/autk-db';
import { MANHATTAN_AREA, MANHATTAN_PBF } from './config';

const URL = import.meta.env.BASE_URL;

export class UrbaneData {
    public db!: AutkDb;

    public async init(): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();
    }

    public async loadBaseData(datasets: string[]): Promise<void> {
        await this.db.loadOsm({
            pbfFileUrl: `${URL}data/${MANHATTAN_PBF}`,
            queryArea: MANHATTAN_AREA,
            outputTableName: 'table_osm',
            autoLoadLayers: {
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'],
            },
        });

        await this.db.loadGeojson({
            geojsonFileUrl: `${URL}data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
        });

        await this.db.spatialQuery({
            tableRootName: 'table_osm_buildings',
            tableJoinName: 'neighborhoods',
        });

        for (const dataset of datasets) {
            await this.db.loadCsv({
                csvFileUrl: `${URL}data/${dataset}_manhattan_clean.csv`,
                outputTableName: dataset,
                geometryColumns: {
                    latColumnName: 'latitude',
                    longColumnName: 'longitude',
                },
            });

            await this.db.spatialQuery({
                tableRootName: 'neighborhoods',
                tableJoinName: dataset,
                groupBy: [{
                    column: 'key',
                    aggregateFn: 'count',
                    normalize: true,
                }],
            });
        }
    }

    public async joinNeighborhoodSkyExposure(): Promise<void> {
        await this.db.spatialQuery({
            tableRootName: 'neighborhoods',
            tableJoinName: 'table_osm_roads',
            groupBy: [{
                column: 'compute.skyViewFactor',
                aggregateFn: 'avg',
                normalize: true,
            }],
        });
    }

    public async loadActiveBuildings(
        datasets: string[],
        neighborhoodNames: string[],
        distance: number,
    ): Promise<FeatureCollection> {
        const inList = neighborhoodNames
            .map((name) => `'${name.replace(/'/g, "''")}'`)
            .join(', ');

        await this.db.rawQuery({
            query: `
                SELECT geometry, properties, building_id
                FROM   table_osm_buildings
                WHERE EXISTS (
                    SELECT 1
                    FROM json_each(properties->'sjoin'->'matches') AS neighborhood_match
                    WHERE neighborhood_match.value->'properties'->>'ntaname' IN (${inList})
                )
            `,
            output: { type: 'CREATE_TABLE', tableName: 'active_buildings', source: 'osm', tableType: 'buildings' },
        });

        for (const dataset of datasets) {
            await this.db.spatialQuery({
                tableRootName: 'active_buildings',
                tableJoinName: dataset,
                near: { distance, useCentroid: true },
                groupBy: [{
                    column: 'key',
                    aggregateFn: 'count',
                    normalize: true,
                }],
            });
        }

        await this.db.spatialQuery({
            tableRootName: 'active_buildings',
            tableJoinName: 'table_osm_roads',
            near: { distance: 300, useCentroid: true },
            groupBy: [{
                column: 'compute.skyViewFactor',
                aggregateFn: 'avg',
                normalize: true,
            }],
        });

        return this.getLayer('active_buildings');
    }

    public async getLayer(name: string): Promise<FeatureCollection> {
        return this.db.getLayer(name);
    }

    public getLayersMetadata() {
        return this.db.getLayersMetadata();
    }

    public async updateLayer(name: string, data: FeatureCollection): Promise<void> {
        await this.db.updateTable({ tableName: name, data, strategy: 'replace' });
    }

    public async removeLayer(name: string): Promise<void> {
        await this.db.removeLayer(name);
    }
}
