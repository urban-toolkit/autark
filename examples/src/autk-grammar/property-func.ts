import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class LoadGeojson {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            compute: "output"
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
                    variableMapping: {
                        x: 'height',
                        y: 'height',
                    },
                    outputColumnName: 'height_sq',
                    wglsFunction: 'return x * y;',
                }
            ]
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new LoadGeojson();

    await example.run();
}

main();