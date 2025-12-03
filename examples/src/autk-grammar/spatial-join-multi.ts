import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class SpatialJoinMulti {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: "map-canvas"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: "geojson",
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
                    outputTableName: 'neighborhoods',
                    coordinateFormat: 'EPSG:3395'
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
                    type: "csv",
                    csvFileUrl: 'http://localhost:5173/data/parking.csv',
                    outputTableName: 'parking',
                    geometryColumns: {
                        latColumnName: 'Latitude',
                        longColumnName: 'Longitude',
                        coordinateFormat: 'EPSG:3395',
                    },
                },
                {
                    type: 'join',
                    tableRootName: 'neighborhoods',
                    tableJoinName: 'noise',
                    spatialPredicate: 'INTERSECT',
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
                },
                {
                    type: 'join',
                    tableRootName: 'neighborhoods',
                    tableJoinName: 'parking',
                    spatialPredicate: 'INTERSECT',
                    output: {
                        type: 'MODIFY_ROOT',
                    },
                    joinType: 'LEFT',
                    groupBy: {
                        selectColumns: [
                            {
                                tableName: 'parking',
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
                        dataRef: 'neighborhoods',
                        getFnv: 'count_noise'
                    }
                ]
            },
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new SpatialJoinMulti();

    await example.run();
}

main();