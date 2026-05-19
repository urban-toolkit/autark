import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

export class GeoJSONVis {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: "map-canvas"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: 'geojson',
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
                    outputTableName: 'neighborhoods',
                    coordinateFormat: 'EPSG:4326'
                }
            ],
            map: {
                layerRefs: [
                    {
                        dataRef: 'neighborhoods'
                    }
                ]
            }

        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new GeoJSONVis();

    await example.run();
}

main();
