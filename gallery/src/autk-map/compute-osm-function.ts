import { AutkSpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';

import { AutkMap, LayerType } from 'autk-map';

import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export class ComputeOsm {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
                dropOsmTable: true,
            },
        });

        let geojson = await this.db.getLayer('table_osm_roads');

        const geojsonCompute = new GeojsonCompute();
        geojson = await geojsonCompute.analytical({
            collection: geojson,
            variableMapping: {
                x: 'lanes',
            },
            resultField: 'result',
            wgslBody: `
                if (x <= 0) {
                    return 1;
                }
                return x;
            `,
        });

        this.map = new AutkMap(canvas);

        await this.map.init();
        await this.loadLayers();
        await this.updateThematicData(geojson);

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection({ id: layerData.name, collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(geojson: FeatureCollection<Geometry, GeoJsonProperties>) {
        const getFnv = (item: any) => {
            const feature = item as Feature;
            const properties = feature.properties as GeoJsonProperties;
            return properties?.compute.result || 0;
        };

        this.map.updateThematic({ id: 'table_osm_roads', collection: geojson, getFnv });
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new ComputeOsm();
    await example.run(canvas);
}
main();
