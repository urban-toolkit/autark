import { AutkMap, LayerType } from 'autk-map';
import { SpatialDb } from 'autk-db';

export class OsmLayersApi {
    protected map01!: AutkMap;
    protected db01!: SpatialDb;

    protected map02!: AutkMap;
    protected db02!: SpatialDb;

    public async run(): Promise<void> {
        this.db01 = new SpatialDb();
        await this.db01.init();

        this.db02 = new SpatialDb();
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

        const canvas01 = document.querySelector('#map01') as HTMLCanvasElement;
        const canvas02 = document.querySelector('#map02') as HTMLCanvasElement;

        if (canvas01 && canvas02) {
            this.map01 = new AutkMap(canvas01);
            this.map02 = new AutkMap(canvas02);

            await this.map01.init(this.db01.getOsmBoundingBox());
            await this.map02.init(this.db02.getOsmBoundingBox());

            this.map01.draw();
            this.map02.draw();

            await this.loadLayers(this.db01, this.map01);
            await this.loadLayers(this.db02, this.map02);
        }
    }

    async loadLayers(db: SpatialDb, map: AutkMap): Promise<void> {
        const data = [];
        for (const layerData of db.tables) {
            if (layerData.source === 'csv') {
                continue;
            }

            const geojson = await db.getLayer(layerData.name);
            data.push({ props: layerData, data: geojson });
        }

        for (const json of data) {
            console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
            map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
        }

    }
}

async function main() {
    const example = new OsmLayersApi();
    await example.run();
}
main();
