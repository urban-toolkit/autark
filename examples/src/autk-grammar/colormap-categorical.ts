import { AutkGrammar, AutkGrammarSpec, ColorMapInterpolator } from 'autk-grammar';

export class ColormapCat {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: "map-canvas"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: 'geojson',
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_roads_flattened.geojson',
                    outputTableName: 'roads',
                    coordinateFormat: 'EPSG:3395'
                }
            ],
            map: {
                style: 'light',
                layerRefs: [
                    {
                        outputTableName: 'roads',
                        colorMapInterpolator: ColorMapInterpolator.OBSERVABLE10,
                        getFnv: 'highway'
                    }
                ]
            }

        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new ColormapCat();

    await example.run();
}

main();
