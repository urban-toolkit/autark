import { SpatialDb } from 'autk-db';

export class RawQueryJoin {
    protected db!: SpatialDb;
    protected geojson!: any;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395',
            type: 'boundaries'
        });

        this.geojson = await this.db.rawQuery({
            query: 'SELECT * FROM neighborhoods LIMIT 5',
            output: {
                type: 'RETURN_OBJECT',
            },
        });

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
                div.innerHTML += `<p>this.geojson[0].properties.boroname: ${JSON.stringify(this.geojson[0].properties.boroname || null)}</p>`;
            }

            div.innerHTML += `<p><b>Successfull Spatial Join.</b><p>`;
        }
    }
}

async function main() {
    const example = new RawQueryJoin();

    await example.run();
    example.print();
}
main();
