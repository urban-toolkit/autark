import { AutkMap, LayerType } from 'autk-map';
import { AutkSpatialDb } from 'autk-db';

export class OsmLayersApi {
    protected map01!: AutkMap;
    protected db01!: AutkSpatialDb;

    protected map02!: AutkMap;
    protected db02!: AutkSpatialDb;

    public async run(canvas01: HTMLCanvasElement, canvas02: HTMLCanvasElement): Promise<void> {
        this.db01 = new AutkSpatialDb();
        this.db02 = new AutkSpatialDb();

        await this.db01.init();
        await this.db02.init();

        await this.db01.loadOsm({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        await this.db02.loadOsm({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        this.map01 = new AutkMap(canvas01);
        this.map02 = new AutkMap(canvas02);

        await this.map01.init();
        await this.map02.init();

        this.map01.draw();
        this.map02.draw();

        await this.loadLayers(this.db01, this.map01);
        await this.loadLayers(this.db02, this.map02);
    }
    
    protected async loadLayers(db: AutkSpatialDb, map: AutkMap): Promise<void> {
        for (const layerData of db.getLayerTables()) {
            const geojson = await db.getLayer(layerData.name);
            map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }
}

async function main() {
    const canvas01 = document.querySelector('#map01') as HTMLCanvasElement;
    const canvas02 = document.querySelector('#map02') as HTMLCanvasElement;

    if (!canvas01 || !canvas02) {
        throw new Error('No canvas found');
    }

    const example = new OsmLayersApi();
    await example.run(canvas01, canvas02);
}
main();
