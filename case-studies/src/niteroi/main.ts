import { AutkMap, LayerType } from 'autk-map';
import { SpatialDb } from 'autk-db';

export class OsmLayersApi {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
            queryArea: {
                geocodeArea: 'Niterói',
                areas: ['Região Praias da Baía'],
            }, outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: [
                    'surface',
                    'parks',
                    'water',
                    'roads'
                ] as Array<'surface' | 'parks' | 'water' | 'roads'>,
                dropOsmTable: true,
            },
        });

        // Clip the tile to the loaded OSM area so only relevant pixels are decoded.
        // getOsmBoundingBoxWgs84 returns the bbox in EPSG:4326, matching the GeoTIFF source CRS.
        const boundingBox = this.db.getOsmBoundingBoxWgs84() ?? undefined;

        this.db.loadGeoTiff({
            geotiffFileUrl: '/data/elevation.tif',
            outputTableName: 'elevation',
            sourceCrs: 'EPSG:4326',
            coordinateFormat: 'EPSG:3395',
            boundingBox,
        });

        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();
        await this.loadGeoTiffLayer('elevation');
        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async loadGeoTiffLayer(tableName: string): Promise<void> {
        const geotiff = await this.db.getGeoTiffLayer(tableName);

        // The getFnv callback extracts the numeric value for each pixel.
        // Adjust the band name (e.g. band_1, band_2) to match your GeoTiff's band columns.
        this.map.loadGeoTiffLayer(tableName, geotiff, LayerType.AUTK_RASTER, (cell) => {
            if (!cell) return 0;
            const props = cell as Record<string, number | undefined>;
            return props['band_1'] ?? 0;
        });

        console.log(`GeoTiff layer "${tableName}" loaded into map.`);
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
