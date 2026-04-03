// TODO: filter CSV data based on the osm data polygon.

import { AutkSpatialDb } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';

export class GeojsonVis {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(): Promise<void> {
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
                layers: ['surface', 'parks', 'water'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        await this.db.loadCsv({
            csvFileUrl: 'http://localhost:5173/data/noise.csv',
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        console.log('Building heatmap...');
        await this.db.buildHeatmap({
            tableJoinName: 'noise',
            nearDistance: 1000,
            outputTableName: 'heatmap',
            grid: {
                rows: 20,
                columns: 20,
            },
            groupBy: {
                selectColumns: [
                    {
                        tableName: 'noise',
                        column: 'Unique Key',
                        aggregateFn: 'weighted'
                    },
                ],
            },
        });


        const canvas = document.querySelector('canvas');
        if (canvas) {
            this.map = new AutkMap(canvas);

            await this.map.init();
            await this.loadLayers();
            this.map.draw();
        }
    }

    protected async loadLayers(): Promise<void> {
        const propertyPath = 'weighted.noise';

        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);

            if (layerData.type === 'raster') {
                this.map.loadCollection({ id: layerData.name, collection: geojson, type: 'raster', property: propertyPath });
            }
            else {
                this.map.loadCollection({ id: layerData.name, collection: geojson, type: layerData.type as LayerType });
            }
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateRenderInfo('heatmap', { opacity: 0.5 });
    }
}

async function main() {
    const example = new GeojsonVis();
    await example.run();
}
main();
