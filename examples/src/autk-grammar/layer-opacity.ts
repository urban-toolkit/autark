import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class LayerOpacity {
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
                        areas: ['Manhattan Island'],
                    },
                    outputTableName: 'table_osm',
                    autoLoadLayers: {
                        coordinateFormat: 'EPSG:3395',
                        layers: ['surface', 'parks', 'water', 'roads'] as Array<
                            'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                        >,
                        dropOsmTable: true,
                    }
                },
                {
                    type: 'geojson',
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
                    outputTableName: 'neighborhoods',
                    coordinateFormat: 'EPSG:3395'
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
                        dataRef: 'table_osm_roads'
                    },
                    {
                        dataRef: 'neighborhoods',
                        opacity: 0.75
                    }
                ]
            }

        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new LayerOpacity();

    await example.run();
}

main();
