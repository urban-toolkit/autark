import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class MapD3Table {
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
                mark: 'table',
                axis: ['ntaname', 'shape_area', 'shape_leng'],
                title: 'Table Visualization',
                width: 790,
                events: ['click'],
                mapRef: 'neighborhoods'
            }
        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new MapD3Table();

    await example.run();
}

main();
