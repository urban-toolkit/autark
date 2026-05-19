import { AutkGrammar, AutkGrammarSpec, ColorMapInterpolator } from '@urban-toolkit/autk-grammar';

export class MultiMap {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: ["map-canvas-left", "map-canvas-right"]
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
            map: [
                {
                    style: 'light',
                    layerRefs: [
                        {
                            dataRef: 'neighborhoods',
                            colorMapInterpolator: ColorMapInterpolator.SEQ_BLUES,
                            getFnv: 'shape_area',
                            getFnvType: 'quantitative',
                        }
                    ]
                },
                {
                    style: 'light',
                    layerRefs: [
                        {
                            dataRef: 'neighborhoods',
                            colorMapInterpolator: ColorMapInterpolator.SEQ_REDS,
                            getFnv: 'shape_leng',
                            getFnvType: 'quantitative',
                        }
                    ]
                }
            ]
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new MultiMap();
    await example.run();
}

main();
