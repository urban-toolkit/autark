import { AutkGrammar, AutkGrammarSpec } from '@urban-toolkit/autk-grammar';

export class OsmLayersPbf {
    protected autkGrammar!: AutkGrammar;

    public async run(): Promise<void> {
        this.autkGrammar = new AutkGrammar({ map: 'map-canvas' });

        const spec: AutkGrammarSpec = {
            data: [{
                type: 'osm',
                pbfFileUrl: '/data/lower_mnt.osm.pbf',
                queryArea: {
                    geocodeArea: 'New York',
                    areas: ['Battery Park City', 'Financial District'],
                },
                outputTableName: 'table_osm',
                autoLoadLayers: {
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

async function main() { await new OsmLayersPbf().run(); }
main();
