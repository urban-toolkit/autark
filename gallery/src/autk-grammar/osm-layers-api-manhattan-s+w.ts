import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

export class OsmLayersApiManhattanSW {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({ map: 'map-canvas' });

        const spec: AutkGrammarSpec = {
            data: [{
                type: 'osm',
                queryArea: { geocodeArea: 'New York', areas: ['Manhattan Island'] },
                outputTableName: 'table_osm',
                autoLoadLayers: {
                    coordinateFormat: 'EPSG:3395',
                    layers: ['surface', 'water'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                    dropOsmTable: true,
                },
            }],
            map: {
                layerRefs: [
                    { dataRef: 'table_osm_surface' },
                    { dataRef: 'table_osm_water' },
                ],
            },
        };

        await this.autkGrammar.run(spec);
    }
}

async function main() { await new OsmLayersApiManhattanSW().run(); }
main();
