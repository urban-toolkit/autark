import { AutkMap, LayerType } from 'autk-map';
import { SpatialDb } from 'autk-db';

const BAND_COUNT = 24;
const START_YEAR = 2001;
const DEFAULT_YEAR = 2010;

export class OsmLayersApi {
    protected map!: AutkMap;
    protected db!: SpatialDb;
    protected geotiffData: any;
    protected roadsGeojson: any;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
            queryArea: {
                geocodeArea: 'Rio de Janeiro',
                areas: ['Niterói'],
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

        if (boundingBox) {
            console.log('OSM Bounding Box (minLon, minLat, maxLon, maxLat):', boundingBox);
        }

        await this.db.loadGeoTiff({
            geotiffFileUrl: '/data/niteroi_lst_verao_2001_2024.tif',
            outputTableName: 'lst',
            sourceCrs: 'EPSG:4326',
            coordinateFormat: 'EPSG:3395',
            boundingBox,
        });

        await this.db.spatialJoin({
            tableRootName: 'table_osm_roads',
            tableJoinName: 'lst',
            spatialPredicate: 'NEAR',
            nearDistance: 1000,
            output: {
                type: 'MODIFY_ROOT',
            },
            joinType: 'LEFT',
            groupBy: {
                selectColumns: Array.from({ length: BAND_COUNT }, (_, i) => ({
                    tableName: 'lst',
                    column: `band_${i + 1}`,
                    aggregateFn: 'avg',
                    aggregateFnResultColumnName: `band_${i + 1}`,
                })),
            },
        });

        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();
        await this.applyRoadslstThematic(`band_${DEFAULT_YEAR - START_YEAR + 1}`);
        await this.loadGeoTiffLayer('lst');
        this.createSlider(canvas);
        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async applyRoadslstThematic(bandName: string): Promise<void> {
        this.roadsGeojson = await this.db.getLayer('table_osm_roads');
        this.map.updateGeoJsonLayerThematic('table_osm_roads', this.roadsGeojson, (feature) => {
            return feature.properties?.sjoin?.avg?.[bandName] ?? 0;
        });
        this.map.updateRenderInfoProperty('table_osm_roads', 'isColorMap', true);
    }

    protected async loadGeoTiffLayer(tableName: string): Promise<void> {
        const geotiff = await this.db.getGeoTiffLayer(tableName);
        this.geotiffData = geotiff;

        const defaultBand = `band_${DEFAULT_YEAR - START_YEAR + 1}`;
        this.map.loadGeoTiffLayer(tableName, geotiff, LayerType.AUTK_RASTER, (cell) => {
            if (!cell) return 0;
            const props = cell as Record<string, number | bigint | string | undefined>;
            return Number(props[defaultBand] ?? NaN);
        });

        this.map.updateRenderInfoProperty(tableName, 'opacity', 0.65);

        console.log(`GeoTiff layer "${tableName}" loaded into map.`);
    }

    protected createSlider(canvas: HTMLCanvasElement): void {
        const container = document.createElement('div');
        container.id = 'sliderPanel';

        const label = document.createElement('div');
        label.id = 'sliderLabel';
        label.textContent = `Year: ${DEFAULT_YEAR}`;
        container.appendChild(label);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(START_YEAR);
        slider.max = String(START_YEAR + BAND_COUNT - 1);
        slider.step = '1';
        slider.value = String(DEFAULT_YEAR);

        slider.addEventListener('input', (e) => {
            const year = parseInt((e.target as HTMLInputElement).value, 10);
            label.textContent = `Year: ${year}`;
            const bandName = `band_${year - START_YEAR + 1}`;

            if (this.geotiffData) {
                this.map.updateGeoTiffLayerData('lst', this.geotiffData, (cell) => {
                    if (!cell) return 0;
                    const props = cell as Record<string, number | bigint | string | undefined>;
                    return Number(props[bandName] ?? NaN);
                });
            }

            if (this.roadsGeojson) {
                this.map.updateGeoJsonLayerThematic('table_osm_roads', this.roadsGeojson, (feature) => {
                    return feature.properties?.sjoin?.avg?.[bandName] ?? 0;
                });
                this.map.draw();
            }
        });

        container.appendChild(slider);

        if (canvas.parentElement) {
            canvas.parentElement.appendChild(container);
        } else {
            document.body.appendChild(container);
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
