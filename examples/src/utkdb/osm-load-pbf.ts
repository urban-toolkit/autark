import { SpatialDb } from 'utkdb';

import { Example } from '../example';

export class OsmLoadPbf extends Example {
    protected db: SpatialDb;
    protected divId: string = 'output-div';

    constructor() {
        super();
        this.db = new SpatialDb();
    }

    public buildHtmlNodes() {
        const app = document.querySelector('#app')
        const div = document.createElement('div');

        div.id = this.divId;
        div.innerHTML = '<h2>osm-load-pbf.ts</h2>';

        if(app) {
            app.appendChild(div);
        }
    }

    public async run(): Promise<void> {
        await this.db.init();

        await this.db.loadOsm({
            pbfFileUrl: 'http://localhost:5173/data/lower-mn.osm.pbf',
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: [
                    'coastline',
                    'parks',
                    'water',
                    'roads',
                    'buildings',
                ] as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });
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
            div.innerHTML += `<p><b>Successfully loaded OSM data from PBF file.</b><p>`;
        }
    }
}