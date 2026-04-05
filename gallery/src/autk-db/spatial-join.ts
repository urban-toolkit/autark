import { FeatureCollection } from 'geojson';
import { AutkSpatialDb } from 'autk-db';

const URL = (import.meta as any).env.BASE_URL;

export class SpatialJoin {
    protected db!: AutkSpatialDb;
    protected geojson!: FeatureCollection;

    public async run(): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: `${URL}/data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
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
            tableRootName: 'neighborhoods',
            tableJoinName: 'noise',
            spatialPredicate: 'INTERSECT',
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

        this.geojson = await this.db.getLayer('neighborhoods');
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

            if (this.geojson) {
                div.innerHTML += `<p>features[0].properties.sjoin: ${JSON.stringify(this.geojson.features[0].properties?.sjoin || null)}</p>`;
            }

            div.innerHTML += `<p><b>Successfull Spatial Join.</b><p>`;
        }
    }
}

async function main() {
    const example = new SpatialJoin();

    await example.run();
    example.print();
}
main();
