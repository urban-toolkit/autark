import { AutkGrammar, AutkGrammarSpec, ColorMapInterpolator, NormalizationMode } from '@urban-toolkit/autk-grammar';

export class ColormapDiverging {
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
                        colorMapInterpolator: ColorMapInterpolator.DIV_SPECTRAL,
                        getFnv: 'shape_area',
                        normalization: { mode: NormalizationMode.PERCENTILE }
                    }
                ]
            }

        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new ColormapDiverging();

    await example.run();
}

main();
