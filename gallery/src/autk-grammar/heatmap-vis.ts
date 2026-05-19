import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

export class HeatmapVis {
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
                        layers: ['surface', 'parks', 'water', 'roads'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                        dropOsmTable: true,
                    }
                },
                {
                    type: 'csv',
                    csvFileUrl: 'http://localhost:5173/data/noise.csv',
                    outputTableName: 'noise',
                    geometryColumns: {
                        latColumnName: 'Latitude',
                        longColumnName: 'Longitude',
                        coordinateFormat: 'EPSG:4326',
                    },
                },
                {
                    type: 'heatmap',
                    tableJoinName: 'noise',
                    near: { distance: 1000 },
                    outputTableName: 'heatmap',
                    grid: {
                        rows: 20,
                        columns: 20,
                    },
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
                        dataRef: 'table_osm_roads'
                    },
                    {
                        dataRef: 'heatmap',
                        opacity: 0.5,
                        getFnv: 'count.noise',
                        defaultFnv: 0
                    }
                ]
            }

        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new HeatmapVis();

    await example.run();
}

main();
