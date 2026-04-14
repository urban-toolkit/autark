import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class MapD3Click {
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
                mark: 'scatter',
                axis: ['shape_area', 'shape_leng'],
                title: 'Plot example',
                width: 790,
                events: ['click'],
                mapRef: 'neighborhoods'
            }
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new MapD3Click();

    await example.run();
}

main();
