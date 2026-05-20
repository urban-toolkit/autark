import { CsvDataSourceSpec, CustomDataSourceSpec, DataAdapter, DataSourceSpec, HeatmapSourceSpec, JoinSourceSpec, JsonDataSourceSpec, OsmDataSourceSpec } from 'urban-grammar';
import { AutkDb } from '@urban-toolkit/autk-db';
import type { FeatureCollection } from 'geojson';
import { Targets, GeoJsonCache } from '../types';

export function createDataAdapter(targets?: Targets, cache?: GeoJsonCache): DataAdapter {

    function print(db: AutkDb, targets?: Targets): void {
        if(!targets || !targets.db)
            return

        const div = document.getElementById(targets.db);
        if (div) {
            const tables = db.tables;

            div.innerHTML += `<ul>`;
            for (const table of tables) {
                div.innerHTML += `<li>${table.name}: (${table.source}, ${table.type}) </li>`;
            }
            div.innerHTML += `</ul>`;

            div.innerHTML += `<p>Number of tables: ${tables.length}</p>`;
        }
    }

    return {
        async resolveSource(context: AutkDb | undefined, spec: DataSourceSpec): Promise<AutkDb | undefined> {

            let db = context;

            if(!db){
                db = new AutkDb();
                await db.init();
            }

            let {type, ...rest_spec} = spec;

            switch (type) {
                case 'osm':
                    await db.loadOsm(rest_spec as OsmDataSourceSpec);
                    print(db, targets);
                    return db;
                case 'csv':
                    await db.loadCsv(rest_spec as CsvDataSourceSpec);
                    print(db, targets);
                    return db;
                case 'json':
                    await db.loadJson(rest_spec as JsonDataSourceSpec);
                    print(db, targets);
                    return db;
                case 'geojson': {
                    const geojsonSpec = rest_spec as CustomDataSourceSpec;
                    let geojsonData: FeatureCollection | undefined;

                    if (geojsonSpec.geojsonFileUrl) {
                        const response = await fetch(geojsonSpec.geojsonFileUrl);
                        geojsonData = await response.json() as FeatureCollection;
                    } else {
                        geojsonData = geojsonSpec.geojsonObject;
                    }

                    if (cache && geojsonData) cache.set(geojsonSpec.outputTableName, geojsonData);

                    // Pass the fetched object directly so autk-db doesn't need to re-fetch
                    if (geojsonData) {
                        const { geojsonFileUrl: _url, ...specWithoutUrl } = geojsonSpec;
                        await db.loadGeojson({ ...specWithoutUrl, geojsonObject: geojsonData });
                    } else {
                        await db.loadGeojson(geojsonSpec);
                    }
                    print(db, targets);
                    return db;
                }
                case 'heatmap': {
                    const hm = rest_spec as HeatmapSourceSpec;
                    await db.buildHeatmap({
                        tableJoinName: hm.tableJoinName,
                        near: { distance: hm.near.distance },
                        outputTableName: hm.outputTableName,
                        grid: hm.grid,
                        ...(hm.groupBy && { groupBy: hm.groupBy as any }),
                    });
                    print(db, targets);
                    return db;
                }
                case 'join': {
                    const jn = rest_spec as JoinSourceSpec;
                    await db.spatialQuery({
                        tableRootName: jn.tableRootName,
                        tableJoinName: jn.tableJoinName,
                        ...(jn.near && { near: jn.near }),
                        ...(jn.groupBy && { groupBy: jn.groupBy }),
                    });
                    if (cache) {
                        const updated = await db.getLayer(jn.tableRootName);
                        cache.set(jn.tableRootName, updated);
                    }
                    print(db, targets);
                    return db;
                }
                default:
                    return
            }
        }
    }
}
