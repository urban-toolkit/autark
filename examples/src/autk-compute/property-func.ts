import { SpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';

export class LoadGeojson {
    protected db!: SpatialDb;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['buildings'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });

        let geojson = await this.db.getLayer('table_osm_buildings');
        console.log({ initialGeojson: geojson });

        const geojsonCompute = new GeojsonCompute();
        geojson = await geojsonCompute.computeFunctionIntoProperties({
            geojson,
            variableMapping: {
                x: 'height',
                y: 'height',
            },
            outputColumnName: 'height_sq',
            wglsFunction: 'x * y',
        });

        console.log({ computedGeojson: geojson });
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
            div.innerHTML += `<p><b>Successfully computed new property.</b><p>`;
        }
    }

}



async function main() {
    const example = new LoadGeojson();

    await example.run();
    example.print();
}

main();
