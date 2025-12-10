import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class SpatialJoinNear {
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
                        layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                            'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                        >,
                        dropOsmTable: true,
                    },
                },
                {
                    type: "csv",
                    csvFileUrl: 'http://localhost:5173/data/noise.csv',
                    outputTableName: 'noise',
                    geometryColumns: {
                        latColumnName: 'Latitude',
                        longColumnName: 'Longitude',
                        coordinateFormat: 'EPSG:3395',
                    },
                },
                {
                    type: "join",
                    tableRootName: 'table_osm_roads',
                    tableJoinName: 'noise',
                    spatialPredicate: 'NEAR',
                    nearDistance: 1000,
                    output: {
                        type: 'MODIFY_ROOT',
                    },
                    joinType: 'LEFT',
                    groupBy: {
                        selectColumns: [
                            {
                                tableName: 'noise',
                                column: 'Unique Key',
                                aggregateFn: 'count',
                            },
                        ],
                    },
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
                        getFnv: 'count_noise'
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
    const example = new SpatialJoinNear();

    await example.run();
}

main();