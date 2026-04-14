import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class MapD3PC {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: "map-canvas",
            plot: "plotBody"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: 'geojson',
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs_proj.geojson',
                    outputTableName: 'neighborhoods',
                    coordinateFormat: 'EPSG:3395'
                }
            ],
            map: {
                layerRefs: [{ dataRef: 'neighborhoods' }]
            },
            plot: {
                dataRef: 'neighborhoods',
                mark: 'parallel-coordinates',
                axis: ['shape_area', 'shape_leng', 'cdta2020'],
                title: 'Neighborhood Characteristics',
                width: 790,
                events: ['brushY'],
                mapRef: 'neighborhoods'
            }
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new MapD3PC();

    await example.run();
}

main();
