import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

const URL = (import.meta as any).env.BASE_URL;

async function main() {
    const grammar = new AutkGrammar({ map: 'map-canvas', plot: 'plotBody' });

    const spec: AutkGrammarSpec = {
        data: [
            {
                type: 'geojson',
                geojsonFileUrl: `${URL}data/mnt_roads.geojson`,
                outputTableName: 'roads',
                coordinateFormat: 'EPSG:3395',
            },
            {
                type: 'csv',
                csvFileUrl: `${URL}data/noise_manhattan_clean.csv`,
                outputTableName: 'noise',
                geometryColumns: {
                    latColumnName: 'latitude',
                    longColumnName: 'longitude',
                    coordinateFormat: 'EPSG:3395',
                },
            },
            {
                type: 'join',
                tableRootName: 'roads',
                tableJoinName: 'noise',
                near: { distance: 200 },
                groupBy: [
                    { column: 'key', aggregateFn: 'count' },
                    { column: 'date', aggregateFn: 'collect' },
                ],
            },
        ],
        map: {
            style: 'light',
            layerRefs: [
                {
                    dataRef: 'roads',
                    isPick: true,
                    getFnv: 'sjoin.count.noise',
                }
            ]
        },
        plot: {
            dataRef: 'roads',
            mark: 'linechart',
            axis: ['sjoin.collect.noise', '@transform'],
            title: 'Monthly noise events per road',
            transform: {
                preset: 'binning-events',
                options: {
                    timestamp: 'date',
                    resolution: 'day',
                    reducer: 'count',
                },
            },
            margins: { left: 60, right: 20, top: 50, bottom: 140 },
            width: 790,
            events: ['brushX'],
            mapRef: 'roads',
        }
    };

    await grammar.run(spec);
}
main();
