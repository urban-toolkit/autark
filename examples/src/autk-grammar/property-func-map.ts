import { AutkGrammar, AutkGrammarSpec, ColorMapInterpolator } from 'autk-grammar';

export class LoadGeojsonMap {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: "map-canvas"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: "osm",
                    queryArea: {
                        geocodeArea: 'New York',
                        areas: ['Battery Park City', 'Financial District'],
                    },
                    outputTableName: 'table_osm',
                    autoLoadLayers: {
                        coordinateFormat: 'EPSG:3395',
                        layers: ['buildings'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                        dropOsmTable: true,
                    },
                },
            ],
            compute: [
                {
                    dataRef: 'table_osm_buildings',
                    attributes: {
                        x: 'height',
                        y: 'height',
                    },
                    outputColumnName: 'height_sq',
                    wglsFunction: 'return x * y;',
                }
            ],
            map: {
                style: 'light',
                layerRefs: [
                    {
                        dataRef: 'table_osm_buildings',
                        colorMapInterpolator: ColorMapInterpolator.DIVERGING_RED_BLUE,
                        getFnv: 'height_sq'
                    }
                ]
            }
            
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new LoadGeojsonMap();

    await example.run();
}

main();