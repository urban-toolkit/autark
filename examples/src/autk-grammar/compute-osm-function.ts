import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class ComputeOSMFunction {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: "map-canvas"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: 'geojson',
                    queryArea: {
                        geocodeArea: 'New York',
                        areas: ['Battery Park City', 'Financial District'],
                    },
                    outputTableName: 'table_osm',
                    autoLoadLayers: {
                        coordinateFormat: 'EPSG:3395',
                        layers: ['surface', 'parks', 'water', 'roads'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                        dropOsmTable: true,
                    }
                },
            ],
            compute: [
                {
                    dataRef: 'table_osm_roads',
                    variableMapping: {
                        x: 'lanes',
                    },
                    outputColumnName: 'result',
                    wglsFunction: `
                        if (x <= 0) {
                            return 1;
                        }
                        return x;
                    `,
                }
            ],
            map: {
                style: 'light',
                layerRefs: [
                    {
                        dataRef: 'table_osm_roads',
                        getFnv: 'result'
                    }
                ]
            },
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new ComputeOSMFunction();

    await example.run();
}

main();
