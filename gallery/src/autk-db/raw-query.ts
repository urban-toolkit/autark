import { AutkSpatialDb } from 'autk-db';

const URL = (import.meta as any).env.BASE_URL;

export class RawQueryJoin {
    protected db!: AutkSpatialDb;
    protected geojson!: any;

    public async run(): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: `${URL}/data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
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
