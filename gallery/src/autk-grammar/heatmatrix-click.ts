import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

const URL = (import.meta as any).env.BASE_URL;

async function main() {
    const grammar = new AutkGrammar({ map: 'map-canvas', plot: 'plotBody' });

    const spec: AutkGrammarSpec = {
        data: [
            {
                type: 'geojson',
                geojsonFileUrl: `${URL}data/mnt_neighs_proj_landuse.geojson`,
                outputTableName: 'neighborhoods',
                coordinateFormat: 'EPSG:3395',
            }
        ],
        map: {
            layerRefs: [{ dataRef: 'neighborhoods', isPick: true }]
        },
        plot: {
            dataRef: 'neighborhoods',
            mark: 'heatmatrix',
            axis: ['shape_area', 'landuse'],
            color: '@transform',
            title: 'Neighborhoods by Area and Land Use',
            width: 790,
            margins: { left: 100, right: 20, top: 50, bottom: 80 },
            transform: { preset: 'binning-2d', options: { binsX: 5 } },
            events: ['click'],
            mapRef: 'neighborhoods',
        }
    };

    await grammar.run(spec);
}
main();
