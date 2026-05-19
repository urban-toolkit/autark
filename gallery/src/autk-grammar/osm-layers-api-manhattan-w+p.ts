import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

export class OsmLayersApiManhattanWP {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({ map: 'map-canvas' });

        const spec: AutkGrammarSpec = {
            data: [{
                type: 'osm',
                queryArea: { geocodeArea: 'New York', areas: ['Manhattan Island'] },
                outputTableName: 'table_osm',
                autoLoadLayers: {
                    layers: ['parks', 'water'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                    dropOsmTable: true,
                },
            }],
            map: {
                layerRefs: [
                    { dataRef: 'table_osm_water' },
                    { dataRef: 'table_osm_parks' },
                ],
            },
        };

        await this.autkGrammar.run(spec);
    }
}

async function main() { await new OsmLayersApiManhattanWP().run(); }
main();
