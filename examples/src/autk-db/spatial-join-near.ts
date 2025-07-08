import { FeatureCollection } from 'geojson';
import { SpatialDb } from 'autk-db';

export class SpatialJoinNear {
    protected db!: SpatialDb;
    protected geojson!: FeatureCollection;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
            boundingBox: {
                minLon: -74.0217296397,
                minLat: 40.6989916231,
                maxLon: -74.0005168092,
                maxLat: 40.7131479624,
            }, outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: [
                    'roads',
                ] as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });
        await this.db.loadCsv({
            csvFileUrl: 'http://localhost:5173/data/noise_sample.csv',
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        await this.db.spatialJoin({
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

            console.log(this.geojson);
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
}
main();