import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class StandalonePointsGeojsonVis {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: "map-canvas"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: 'geojson',
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs_proj.geojson',
                    outputTableName: 'neighborhoods',
                    coordinateFormat: 'EPSG:3395'
                },
                {
                    type: 'geojson',
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_points_test_proj.geojson',
                    outputTableName: 'points',
                    coordinateFormat: 'EPSG:3395'
                }
            ],
            map: {
                layerRefs: [
                    {
                        dataRef: 'neighborhoods'
                    },
                    {
                        dataRef: 'points'
                    }
                ]
            }
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new StandalonePointsGeojsonVis();

    await example.run();
}

main();
