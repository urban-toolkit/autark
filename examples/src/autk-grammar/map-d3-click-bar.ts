import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class MapD3ClickBar {
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
                mark: 'bar',
                axis: ['ntaname', 'shape_area'],
                title: 'Plot example',
                width: 790,
                margins: { left: 60, right: 20, top: 50, bottom: 200 },
                events: ['click'],
                mapRef: 'neighborhoods'
            }
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new MapD3ClickBar();

    await example.run();
}

main();
