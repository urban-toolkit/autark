import { CsvDataSourceSpec, CustomDataSourceSpec, DataAdapter, DataSourceSpec, HeatmapSourceSpec, JoinSourceSpec, JsonDataSourceSpec, OsmDataSourceSpec } from 'urban-grammar';
import { SpatialDb } from 'autk-db';
import { Targets, GeoJsonCache } from '../types';

export function createDataAdapter(targets?: Targets, cache?: GeoJsonCache): DataAdapter {

    function print(db: SpatialDb, targets?: Targets): void {
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
        async resolveSource(context: SpatialDb | undefined, spec: DataSourceSpec): Promise<SpatialDb | undefined> {

            let db = context;

            if(!db){
                db = new SpatialDb();
                await db.init();
            }

            let {type, ...rest_spec} = spec;

            switch (type) {
                case 'osm':
                    await db.loadOsmFromOverpassApi(rest_spec as OsmDataSourceSpec);
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
                    if(cache) {
                        let geojson;
                        if(geojsonSpec.geojsonFileUrl) {
                            const response = await fetch(geojsonSpec.geojsonFileUrl);
                            geojson = await response.json();
                        } else {
                            geojson = geojsonSpec.geojsonObject;
                        }
                        if(geojson) cache.set(geojsonSpec.outputTableName, geojson);
                    }
                    await db.loadCustomLayer(geojsonSpec);
                    print(db, targets);
                    return db;
                }
                case 'heatmap': 
                    await db.buildHeatmap(rest_spec as HeatmapSourceSpec);
                    print(db, targets);
                    return db;
                case 'join':
                    await db.spatialJoin(rest_spec as JoinSourceSpec);
                    print(db, targets);
                    return db;
                default: 
                    return 
            }
        }
    }
}
