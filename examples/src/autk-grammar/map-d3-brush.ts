import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class MapD3Brush {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            db: "output"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: 'geojson',
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
                    outputTableName: 'neighborhoods',
                    coordinateFormat: 'EPSG:3395'
                }
            ],
            
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new MapD3Brush();

    await example.run();
}

main();