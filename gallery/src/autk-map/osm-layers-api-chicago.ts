import { AutkMap, LayerType } from '@urban-toolkit/autk-map';
import { AutkDb } from '@urban-toolkit/autk-db';

export class OsmLayersApi {
    protected map!: AutkMap;
    protected db!: AutkDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'Chicago',
                areas: [
                    'Near North Side',
                    'Loop',
                    'Near South Side',
                    'West Town',
                    'Near West Side',
                    'Lower West Side',
                    'Armour Square',
                    'Bridgeport'
                ],
            }, 
            outputTableName: 'table_osm',
            // forceRefresh: true,
            autoLoadLayers: {
                layers: [
                    'surface',
                    'parks',
                    'water',
                    'roads',
                    'buildings',
                ] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });

        this.map = new AutkMap(canvas);

        await this.map.init();
        await this.loadLayers();

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType, allowZeroHeightBuildings: true });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new OsmLayersApi();
    await example.run(canvas);
}
main();