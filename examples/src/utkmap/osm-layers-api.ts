import { UtkMap, LayerType } from 'utkmap';
import { SpatialDb } from 'utkdb';

import { Example } from '../example';

export class OsmLayersApi extends Example {
    protected map!: UtkMap;
    protected db!: SpatialDb;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
            boundingBox: {
                minLon: -74.0217296397,
                minLat: 40.6989916231,
                maxLon: -74.0005168092,
                maxLat: 40.7131479624,
            }, outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: [
                    'coastline',
                    'parks',
                    'water',
                    'roads',
                    'buildings',
                ] as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });

        const canvas = document.querySelector('canvas');
        if (canvas) {
            canvas.width = canvas.height = canvas.parentElement?.clientHeight || 800;

            this.map = new UtkMap(canvas);

            await this.map.init(this.db.getOsmBoundingBox());
            await this.loadLayers();

            this.map.draw();
        }
    }

    async loadLayers(): Promise<void> {
        const data = [];
        for (const layerData of this.db.tables) {

            if (layerData.source === 'csv') {
                continue;
            }

            const geojson = await this.db.getLayer(layerData.name);
            data.push({ props: layerData, data: geojson });
        }

        for (const json of data) {
            console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
            this.map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
        }
    }
}

async function main() {
    const example = new OsmLayersApi();
    await example.run();
}
main();