import { SpatialDb } from 'utkdb';

import { Example } from '../example';

export class OsmLoadPbf extends Example {
    protected db!: SpatialDb;
    protected divId: string = 'output-div';

    constructor() {
        super();
    }

    public buildHtml() {
        const app = document.querySelector('#app') as HTMLElement | null;
        const div = document.createElement('div');

        if(!app || !div) { return; }

        app.style.width = '800px';
        app.style.minHeight = '275px';
        app.style.border = '1px solid #bfbfbf';

        div.id = this.divId;
        div.innerHTML = '<h2>osm-load-pbf.ts</h2>';

        if(app) {
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