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
            mark: 'bar',
            axis: ['ntaname', 'shape_area'],
            title: 'Barchart example',
            width: 790,
            margins: { left: 60, right: 20, top: 50, bottom: 200 },
            events: ['click'],
            mapRef: 'neighborhoods',
        }
    };

    await grammar.run(spec);
}
main();
