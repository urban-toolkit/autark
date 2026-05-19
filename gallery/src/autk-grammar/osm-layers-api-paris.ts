import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

export class OsmLayersApiParis {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({ map: 'map-canvas' });

        const spec: AutkGrammarSpec = {
            data: [{
                type: 'osm',
                queryArea: {
                    geocodeArea: 'Île-de-France',
                    areas: [
                        'Paris 1er Arrondissement',
                        'Paris 2e Arrondissement',
                        'Paris 3e Arrondissement',
                        'Paris 4e Arrondissement',
                        'Paris 5e Arrondissement',
                        'Paris 6e Arrondissement',
                        'Paris 7e Arrondissement',
                        'Paris 8e Arrondissement',
                        'Paris 9e Arrondissement',
                    ],
                },
                outputTableName: 'table_osm',
                autoLoadLayers: {
                    coordinateFormat: 'EPSG:3395',
                    layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                        'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                    >,
                    dropOsmTable: true,
                },
            }],
            map: {
                layerRefs: [
                    { dataRef: 'table_osm_surface' },
                    { dataRef: 'table_osm_parks' },
                    { dataRef: 'table_osm_water' },
                    { dataRef: 'table_osm_roads' },
                    { dataRef: 'table_osm_buildings' },
                ],
            },
        };

        await this.autkGrammar.run(spec);
    }
}

async function main() { await new OsmLayersApiParis().run(); }
main();
