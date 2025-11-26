import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class GeoJSONBoundariesVis {
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
                    coordinateFormat: 'EPSG:3395'
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
    const example = new GeoJSONBoundariesVis();

    await example.run();
}

main();
