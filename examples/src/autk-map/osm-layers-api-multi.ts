import { AutkMap, LayerType } from 'autk-map';
import { SpatialDb } from 'autk-db';

export class OsmLayersApi {
    protected map01!: AutkMap;
    protected db01!: SpatialDb;

    protected map02!: AutkMap;
    protected db02!: SpatialDb;

    public async run(canvas01: HTMLCanvasElement, canvas02: HTMLCanvasElement): Promise<void> {
        this.db01 = new SpatialDb();
        this.db02 = new SpatialDb();

        await this.db01.init();
        await this.db02.init();

        await this.db01.loadOsmFromOverpassApi({
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

        await this.db02.loadOsmFromOverpassApi({
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
    
    protected async loadLayers(db: SpatialDb, map: AutkMap): Promise<void> {
        for (const layerData of db.getLayerTables()) {
            const geojson = await db.getLayer(layerData.name);
            map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
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
