import { CsvDataSourceSpec, CustomDataSourceSpec, DataAdapter, DataSourceSpec, HeatmapSourceSpec, JsonDataSourceSpec, OsmDataSourceSpec } from 'urban-grammar';
import { SpatialDb } from 'autk-db';
import { Targets } from '../types';

export function createDataAdapter(targets?: Targets): DataAdapter {

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
                case 'geojson':
                    await db.loadCustomLayer(rest_spec as CustomDataSourceSpec);
                    print(db, targets);
                    return db;
                case 'heatmap': 
                    await db.buildHeatmap(rest_spec as HeatmapSourceSpec);
                    print(db, targets);
                    return db;
                default: 
                    return 
            }
        }
    }
}
