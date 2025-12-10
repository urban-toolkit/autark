import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class SpatialJoin {
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
                    type: "join",
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
                }
            ],
            map: {
                layerRefs: [
                    {
                        dataRef: 'neighborhoods',
                        getFnv: 'count_noise',
                        defaultFnv: 0
                    }
                ]
            },
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new SpatialJoin();

    await example.run();
}

main();