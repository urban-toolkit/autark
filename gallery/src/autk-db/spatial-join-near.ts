import { FeatureCollection } from 'geojson';
import { AutkSpatialDb } from 'autk-db';

const URL = (import.meta as any).env.BASE_URL;

export class SpatialJoinNear {
    protected db!: AutkSpatialDb;
    protected geojson!: FeatureCollection;

    public async run(): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        await this.db.loadCsv({
            csvFileUrl: `${URL}/data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

    await this.db.spatialQuery({
            tableRootName: 'table_osm_roads',
            tableJoinName: 'noise',
            spatialPredicate: 'NEAR',
            nearDistance: 1000,
            output: {
                type: 'MODIFY_ROOT',
            },
            joinType: 'LEFT',
            groupBy: {
                selectColumns: [
                    {
                        tableName: 'noise',
                        column: 'Unique Key',
                        aggregateFn: 'count',
                    },
                ],
            },
        });

        this.geojson = await this.db.getLayer('table_osm_roads');
        console.log({
            data: this.geojson,
        });
    }

    public print(): void {
        const div = document.getElementById('output');
        
        if (div) {
            const tables = this.db.tables;

            div.innerHTML += `<ul>`;
            for (const table of tables) {
                div.innerHTML += `<li>${table.name}: (${table.source}, ${table.type}) </li>`;
            }
            div.innerHTML += `</ul>`;

            div.innerHTML += `<p>Number of tables: ${tables.length}</p>`;

            if(this.geojson) {
                div.innerHTML += `<p>features[0].properties.sjoin: ${JSON.stringify(this.geojson.features[0].properties?.sjoin || null)}</p>`;
            }

            div.innerHTML += `<p><b>Successfull Spatial Join (Near).</b><p>`;
        }
    }
}

async function main() {
    const example = new SpatialJoinNear();

    await example.run();
    example.print();
}
main();
