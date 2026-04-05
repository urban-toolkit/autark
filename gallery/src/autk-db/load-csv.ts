import { AutkSpatialDb } from 'autk-db';

const URL = (import.meta as any).env.BASE_URL;

export class LoadCsv {
    protected db!: AutkSpatialDb;

    public async run(): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
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
            div.innerHTML += `<p><b>Successfully loaded CSV file.</b><p>`;
        }
    }
}

async function main() {
    const example = new LoadCsv();

    await example.run();
    example.print();
}
main();
