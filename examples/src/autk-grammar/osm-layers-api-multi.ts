import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class OsmLayersAPIMulti {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: ["map01", "map02"]
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: "osm",
                    queryArea: {
                        geocodeArea: 'New York',
                        areas: ['Battery Park City'],
                    },
                    outputTableName: 'table_osm_battery',
                    autoLoadLayers: {
                        coordinateFormat: 'EPSG:3395',
                        layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                            'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                        >,
                        dropOsmTable: true,
                    },
                },
                {
                    type: "osm",
                    queryArea: {
                        geocodeArea: 'New York',
                        areas: ['Financial District'],
                    },
                    outputTableName: 'table_osm',
                    autoLoadLayers: {
                        coordinateFormat: 'EPSG:3395',
                        layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                            'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                        >,
                        dropOsmTable: true,
                    },
                }
            ],
            map: [
                {
                    layerRefs: [
                        {
                            dataRef: 'table_osm_battery_surface'
                        },
                        {
                            dataRef: 'table_osm_battery_parks'
                        },
                        {
                            dataRef: 'table_osm_battery_water'
                        },
                        {
                            dataRef: 'table_osm_battery_roads'
                        },
                        {
                            dataRef: 'table_osm_battery_buildings'
                        }
                    ]
                },
                {
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
            ]
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new OsmLayersAPIMulti();

    await example.run();
}

main();