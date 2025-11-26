import { AutkGrammar, AutkGrammarSpec } from 'autk-grammar';

export class GeoJSONLinesVis {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({
            map: "map-canvas"
        });

        const spec: AutkGrammarSpec = {
            data: [
                {
                    type: 'geojson',
                    geojsonFileUrl: 'http://localhost:5173/data/mnt_roads.geojson',
                    outputTableName: 'roads',
                    coordinateFormat: 'EPSG:3395'
                }
            ],
            map: {
                layerRefs: [
                    {
                        dataRef: 'roads',
                        opacity: 0.75
                    }
                ]
            }

        }

        await this.autkGrammar.run(spec);
    }
}

async function main() {
    const example = new GeoJSONLinesVis();

    await example.run();
}

main();
