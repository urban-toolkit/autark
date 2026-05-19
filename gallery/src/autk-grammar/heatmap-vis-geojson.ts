import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

export class HeatmapVisGeojson {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({ map: 'map-canvas' });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: 'geojson',
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
                    outputTableName: 'neighborhoods',
                    coordinateFormat: 'EPSG:3395',
                },
                {
                    type: 'csv',
                    csvFileUrl: 'http://localhost:5173/data/noise.csv',
                    outputTableName: 'noise',
                    geometryColumns: {
                        latColumnName: 'Latitude',
                        longColumnName: 'Longitude',
                        coordinateFormat: 'EPSG:3395',
                    },
                },
                {
                    type: 'heatmap',
                    tableJoinName: 'noise',
                    nearDistance: 1000,
                    outputTableName: 'heatmap',
                    grid: { rows: 30, columns: 30 },
                    groupBy: {
                        selectColumns: [{
                            tableName: 'noise',
                            column: 'Unique Key',
                            aggregateFn: 'count',
                        }],
                    },
                },
            ],
            map: {
                layerRefs: [
                    { dataRef: 'neighborhoods' },
                    { dataRef: 'heatmap', opacity: 0.5, getFnv: 'count.noise' },
                ],
            },
        };

        await this.autkGrammar.run(spec);
    }
}

async function main() { await new HeatmapVisGeojson().run(); }
main();
