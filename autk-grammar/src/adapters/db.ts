import { CsvDataSourceSpec, DbAdapter, DbSourceSpec, JsonDataSourceSpec, OsmDataSourceSpec } from 'urban-grammar'
import { SpatialDb } from 'autk-db';

export function createDbAdapter(): DbAdapter {
    return {
        async resolveSource(spec: DbSourceSpec): Promise<void> {

            const db = new SpatialDb();
            await db.init();

            let {type, ...rest_spec} = spec;

            switch (type) {
                case 'osm':
                    await db.loadOsmFromOverpassApi(rest_spec as OsmDataSourceSpec);
                    console.log("Loaded tables: ", db.tables);
                    return
                case 'csv':
                    await db.loadCsv(rest_spec as CsvDataSourceSpec);
                    console.log("Loaded tables: ", db.tables);
                    return
                case 'json':
                    await db.loadJson(rest_spec as JsonDataSourceSpec);
                    console.log("Loaded tables: ", db.tables)
                    return
                default: 
                    return
            }
        }
    }
}
