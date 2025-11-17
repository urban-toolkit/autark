import { CsvDataSourceSpec, DbAdapter, DbSourceSpec, JsonDataSourceSpec, OsmDataSourceSpec } from 'urban-grammar'
import { SpatialDb } from 'autk-db';
import { Targets } from '../types';

export function createDbAdapter(targets?: Targets): DbAdapter {

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
        async resolveSource(spec: DbSourceSpec): Promise<void> {

            const db = new SpatialDb();
            await db.init();

            let {type, ...rest_spec} = spec;

            switch (type) {
                case 'osm':
                    await db.loadOsmFromOverpassApi(rest_spec as OsmDataSourceSpec);
                    print(db, targets);
                    return
                case 'csv':
                    await db.loadCsv(rest_spec as CsvDataSourceSpec);
                    print(db, targets);
                    return
                case 'json':
                    await db.loadJson(rest_spec as JsonDataSourceSpec);
                    print(db, targets);
                    return
                default: 
                    return
            }
        }
    }
}
