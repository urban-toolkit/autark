import { AutkGrammar } from 'autk-grammar';

export class LoadCsv {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            db: "output"
        });

        const spec = {
            data: [
                {
                    type: "csv",
                    csvFileUrl: 'http://localhost:5173/data/noise.csv',
                    outputTableName: 'noise',
                    geometryColumns: {
                        latColumnName: 'Latitude',
                        longColumnName: 'Longitude',
                        coordinateFormat: 'EPSG:3395',
                    },
                },
                {
                    type: "json",
                    jsonFileUrl: 'http://localhost:5173/data/mnt.geojson'
                }
            ]
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new LoadCsv();

    await example.run();
}

main();