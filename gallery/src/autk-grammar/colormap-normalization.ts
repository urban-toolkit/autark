import { AutkGrammar, AutkGrammarSpec, ColorMapInterpolator, NormalizationMode } from '@urban-toolkit/autk-grammar';

export class ColormapNormalization {
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
                style: 'light',
                layerRefs: [
                    {
                        dataRef: 'neighborhoods',
                        colorMapInterpolator: ColorMapInterpolator.SEQ_REDS,
                        getFnv: 'shape_area',
                        getFnvType: 'quantitative',
                        normalization: {
                            mode: NormalizationMode.PERCENTILE,
                            lowerPercentile: 5,
                            upperPercentile: 95,
                        }
                    }
                ]
            }
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new ColormapNormalization();
    await example.run();
}

main();
