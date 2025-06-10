import { FeatureCollection } from 'geojson';
import { SpatialDb } from 'utkdb';

import { Example } from '../example';

export class SpatialJoinNear extends Example {
    protected db!: SpatialDb;
    protected divId: string = 'output-div';

    protected geojson!: FeatureCollection;

    constructor() {
        super();
    }

    public buildHtml() {
        const app = document.querySelector('#app') as HTMLElement | null;
        const div = document.createElement('div');

        if (!app || !div) { return; }

        app.style.width = '800px';
        app.style.minHeight = '285px';
        app.style.border = '1px solid #bfbfbf';

        div.id = this.divId;
        div.innerHTML = '<h2>spatial-join-near.ts</h2>';

        if (app) {
            app.appendChild(div);
        }
    }

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsm({
            pbfFileUrl: 'http://localhost:5173/data/lower-mn.osm.pbf',
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: [
                    'roads'
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
        const div = document.getElementById(this.divId);
        
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