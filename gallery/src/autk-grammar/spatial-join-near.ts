import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

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
                        coordinateFormat: 'EPSG:4326',
                    },
                },
                {
                    type: "join",
                    tableRootName: 'table_osm_roads',
                    tableJoinName: 'noise',
                    near: { distance: 1000 },
                    groupBy: [{ column: 'Unique Key', aggregateFn: 'count' }],
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
                        getFnv: 'sjoin.count.noise'
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