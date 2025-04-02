import { FeatureCollection } from 'geojson';

import { LayerType } from 'utkmap';
import { SpatialDb } from 'utkdb';

export class DbMapIntegration {
    private projection: string;

    private db: SpatialDb;

    constructor(projection: string = 'EPSG:3395') {
        this.db = new SpatialDb();
        this.projection = projection;
    }

    async loadOsmData(pbfFileUrl: string = 'http://localhost:5173/data/lower-mn.osm.pbf', osmLayers: LayerType[] = [LayerType.OSM_COASTLINE, LayerType.OSM_PARKS, LayerType.OSM_WATER, LayerType.OSM_ROADS, LayerType.OSM_BUILDINGS], osmTable: string = 'table_osm') {
        // DB Initialization
        await this.db.init();

        // Loading osm layers
        await this.db.loadOsm({
            pbfFileUrl: pbfFileUrl,
            outputTableName: osmTable,
            autoLoadLayers: {
                coordinateFormat: this.projection,
                layers: osmLayers as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
            },
        });
    }

    async loadCustomLayer(geoJsonUrl = 'http://localhost:5173/data/mnt_neighs.geojson', geojsonTable = 'geojson_table') {
        // Loading custom layers
        await this.db.loadCustomLayer({
            geojsonFileUrl: geoJsonUrl,
            outputTableName: geojsonTable,
            coordinateFormat: this.projection,
        });
    }

    async csvLoadTest(csvFileUrl = 'http://localhost:5173/data/noise_sample.csv', csvTable = 'csv_table') {
        await this.db.loadCsv({
            csvFileUrl: csvFileUrl,
            outputTableName: csvTable,
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: this.projection,
            },
        });
    }


    async exportLayers(): Promise<{ name: string; data: FeatureCollection }[]> {
        console.log(this.db.tables);

        const data = [];
        for (const layerData of this.db.tables) {
            // TODO: OSM Type?
            if (layerData.type !== 'layer') {
                continue;
            }

            const osmGeojson = await this.db.getLayer(layerData.name);
            data.push({ name: layerData.name, data: osmGeojson });
        }

        // // Exporting custom layers
        // const layerName = `${this.customTable}_mnt_neighs`;
        // const customOsmGeojson = await this.db.getLayer(layerName);
        // data.push({ name: layerName, data: customOsmGeojson });

        return data;
    }
}
