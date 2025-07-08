import { SpatialDb } from 'autk-db';

export class LoadCsv {
    protected db!: SpatialDb;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadCsv({
            csvFileUrl: 'http://localhost:5173/data/noise_sample.csv',
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
    example.print();}
main();