import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class OsmLayersAPINiteroi {
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
                        geocodeArea: 'Niterói',
                        areas: ['Região Praias da Baía'],
                    }, outputTableName: 'table_osm',
                    autoLoadLayers: {
                        coordinateFormat: 'EPSG:3395',
                        layers: [
                            'surface',
                            'parks',
                            'water',
                            'roads',
                            'buildings',
                        ] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                        dropOsmTable: true,
                    },
                },
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
                        dataRef: 'table_osm_roads'
                    },
                    {
                        dataRef: 'table_osm_buildings'
                    }
                ]
            },
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new OsmLayersAPINiteroi();

    await example.run();
}

main();