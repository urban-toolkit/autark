import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

export class OsmLayersApiManhattanSP {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({ map: 'map-canvas' });

        const spec: AutkGrammarSpec = {
            data: [{
                type: 'osm',
                queryArea: { geocodeArea: 'New York', areas: ['Manhattan Island'] },
                outputTableName: 'table_osm',
                autoLoadLayers: {
                    layers: ['surface', 'parks'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                    dropOsmTable: true,
                },
            }],
            map: {
                layerRefs: [
                    { dataRef: 'table_osm_surface' },
                    { dataRef: 'table_osm_parks' },
                ],
            },
        };

        await this.autkGrammar.run(spec);
    }
}

async function main() { await new OsmLayersApiManhattanSP().run(); }
main();
