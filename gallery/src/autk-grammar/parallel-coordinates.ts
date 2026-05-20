import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

const URL = (import.meta as any).env.BASE_URL;

async function main() {
    const grammar = new AutkGrammar({ map: 'map-canvas', plot: 'plotBody' });

    const spec: AutkGrammarSpec = {
        data: [
            {
                type: 'geojson',
                geojsonFileUrl: `${URL}data/mnt_neighs_proj.geojson`,
                outputTableName: 'neighborhoods',
                coordinateFormat: 'EPSG:3395',
            }
        ],
        map: {
            layerRefs: [{ dataRef: 'neighborhoods', isPick: true }]
        },
        plot: {
            dataRef: 'neighborhoods',
            mark: 'parallel-coordinates',
            axis: ['shape_area', 'shape_leng', 'cdta2020'],
            title: 'Neighborhood Characteristics',
            width: 790,
            events: ['brushY'],
            mapRef: 'neighborhoods',
        }
    };

    await grammar.run(spec);
}
main();
