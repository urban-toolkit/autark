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
                    type: 'osm',
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
                    attributes: {
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
                layerRefs: [
                    {
                        dataRef: 'table_osm_surface'
                    },
                    {
                        dataRef: 'table_osm_parks'
                    },
                    {
                        dataRef: 'table_osm_water'
                    },
                    {
                        dataRef: 'table_osm_roads',
                        getFnv: 'compute.result',
                        getFnvType: 'quantitative',
                        defaultFnv: 0
                    },
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
