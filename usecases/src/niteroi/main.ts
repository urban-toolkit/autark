import { AutkMap, LayerType, ColorMapInterpolator, ColorMapDomainMode, VectorLayer, MapStyle } from 'autk-map';
import { AutkSpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';
import { Scatterplot, PlotEvent, Linechart, PlotStyle } from 'autk-plot';
import { lstRegressionShader } from './lst-regression-shader';

declare function setLoadingState(message: string, note?: string): void;
declare function hideLoading(): void;
declare function showError(message: string, note?: string): void;

const BAND_COUNT = 24;
const START_YEAR = 2001;
const HIGHLIGHT_COLOR = '#1a7a2e';

export class OsmLayersApi {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;
    protected plot!: Scatterplot;
    protected linechart!: Linechart;
    protected geotiffData: any;
    protected roadsGeojson: any;
    protected computedRoadsGeojson: any;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        setLoadingState('Initializing spatial database...', 'Preparing the in-browser data environment.');
        this.db = new AutkSpatialDb();
        await this.db.init();

        setLoadingState('Loading OpenStreetMap data...', 'Fetching Niterói area from Overpass API.');
        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'Rio de Janeiro',
                areas: ['Niterói'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads'] as Array<'surface' | 'parks' | 'water' | 'roads'>,
                dropOsmTable: true,
            },
        });

        const boundingBox = this.db.getOsmBoundingBoxWgs84() ?? undefined;

        setLoadingState('Loading temperature dataset...', 'Importing 24-year land surface temperature raster.');
        await this.db.loadGeoTiff({
            geotiffFileUrl: '/data/niteroi_lst_verao_2001_2024.tif',
            outputTableName: 'lst',
            sourceCrs: 'EPSG:4326',
            coordinateFormat: 'EPSG:3395',
            boundingBox,
        });

        setLoadingState('Joining LST to road segments...', 'Averaging temperature bands within 1 km of each road.');
        await this.db.spatialQuery({
            tableRootName: 'table_osm_roads',
            tableJoinName: 'lst',
            spatialPredicate: 'NEAR',
            nearDistance: 1000,
            output: { type: 'MODIFY_ROOT' },
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

        await this.applyLstCompute();

        setLoadingState('Initializing map...', 'Preparing the WebGPU rendering context.');
        this.map = new AutkMap(canvas);
        await this.map.init();

        MapStyle.setHighlightColor(HIGHLIGHT_COLOR);
        PlotStyle.setHighlightColor(HIGHLIGHT_COLOR);

        setLoadingState('Rendering layers...', 'Uploading geometry to the GPU.');
        await this.loadLayers();
        await this.applyRoadslstThematic();
        await this.loadGeoTiffLayer('lst');

        this.setupControls();
        this.setupPlot();
        this.setupPickListener();

        this.map.draw();
        hideLoading();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection({ id: layerData.name, collection: geojson, type: layerData.type as LayerType });
        }
    }

    protected async applyLstCompute(): Promise<void> {
        setLoadingState('Merging temperature bands...', 'Building per-road LST timeseries.');
        const bandSelects = Array.from({ length: BAND_COUNT }, (_, i) =>
            `COALESCE(json_extract(properties, '$.sjoin.avg.band_${i + 1}')::DOUBLE, 0)`
        ).join(', ');

        await this.db.rawQuery({
            query: `
                SELECT
                    geometry,
                    json_merge_patch(
                        COALESCE(CAST(properties AS JSON), '{}'::JSON),
                        json_object('lst_timeseries', [${bandSelects}])
                    ) AS properties
                FROM table_osm_roads
            `,
            output: { type: 'CREATE_TABLE', tableName: 'table_osm_roads', source: 'osm', tableType: 'roads' },
        });

        setLoadingState('Running GPU regression...', 'Computing OLS slope and intercept on the GPU.');
        const compute = new GeojsonCompute();
        const geojson = await this.db.getLayer('table_osm_roads');

        this.computedRoadsGeojson = await compute.analytical({
            collection: geojson,
            variableMapping: { bands: 'lst_timeseries' },
            attributeArrays: { bands: BAND_COUNT },
            outputColumns: ['angle', 'intercept'],
            wgslBody: lstRegressionShader,
        });
    }

    protected updateRoadsThematic(mode: 'slope' | 'year', year?: number): void {
        const interpolator = mode === 'slope'
            ? ColorMapInterpolator.DIVERGING_RED_BLUE
            : ColorMapInterpolator.SEQUENTIAL_REDS;

        this.map.updateColorMap({
            id: 'table_osm_roads',
            colorMap: {
                interpolator,
                domain: mode === 'slope'
                    ? { type: ColorMapDomainMode.PERCENTILE, params: [0.02, 0.98] }
                    : { type: ColorMapDomainMode.MIN_MAX },
            },
        });
        this.map.updateRenderInfo('table_osm_roads', { isColorMap: true });

        this.map.updateThematic({
            id: 'table_osm_roads',
            collection: this.roadsGeojson,
            property: mode === 'slope'
                ? 'properties.compute.angle'
                : `properties.lst_timeseries.${year! - START_YEAR}`,
        });

        // Labels are computed internally from data + current colormap domain mode.
    }

    protected async applyRoadslstThematic(): Promise<void> {
        this.roadsGeojson = this.computedRoadsGeojson;
        this.updateRoadsThematic('slope');
    }

    protected async loadGeoTiffLayer(tableName: string): Promise<void> {
        const geotiff = await this.db.getGeoTiffLayer(tableName);
        this.geotiffData = geotiff;

        const yearSelect = document.getElementById('yearSelect') as HTMLSelectElement;
        const defaultBand = `band_${parseInt(yearSelect.value, 10) - START_YEAR + 1}`;
        this.map.loadCollection({
            id: tableName,
            collection: geotiff,
            type: 'raster',
            property: defaultBand,
        });

        this.map.updateRenderInfo(tableName, { isSkip: true });
        this.map.updateRenderInfo(tableName, { opacity: 0.65 });
    }

    protected setupControls(): void {
        const yearSelect = document.getElementById('yearSelect') as HTMLSelectElement;
        const slopeToggle = document.getElementById('slopeToggle') as HTMLInputElement;
        let colorMode: 'slope' | 'year' = 'slope';

        slopeToggle.addEventListener('change', () => {
            colorMode = slopeToggle.checked ? 'slope' : 'year';
            this.updateRoadsThematic(colorMode, parseInt(yearSelect.value, 10));
            this.map.draw();
        });

        yearSelect.addEventListener('change', () => {
            const year = parseInt(yearSelect.value, 10);
            const bandName = `band_${year - START_YEAR + 1}`;

            if (this.geotiffData) {
                this.map.updateThematic({
                    id: 'lst',
                    collection: this.geotiffData,
                    property: `properties.${bandName}`,
                });
            }

            this.updateRoadsThematic(colorMode, year);
            this.map.draw();
        });
    }

    protected setupPlot(): void {
        this.plot = new Scatterplot({
            div: document.getElementById('plotBody') as HTMLElement,
            collection: this.computedRoadsGeojson,
            attributes: ['compute.intercept', 'compute.angle'],
            labels: { axis: ['Baseline LST (°C)', 'Warming angle (°)'], title: 'LST regression' },
            tickFormats: ['.1~f', '.3~f'],
            width: 600,
            height: 380,
            events: [PlotEvent.BRUSH],
        });

        this.plot.events.addListener(PlotEvent.BRUSH, ({ selection: ids }) => {
            const layer = this.map.layerManager.searchByLayerId('table_osm_roads') as VectorLayer;
            if (layer) layer.setHighlightedIds(ids);
            this.map.draw();
        });

        this.linechart = new Linechart({
            div: document.getElementById('lineChartBody') as HTMLElement,
            collection: this.computedRoadsGeojson,
            attributes: ['lst_timeseries', 'compute.angle', 'compute.intercept'],
            labels: { axis: ['Year', 'LST (°C)'], title: 'Selected Road LST timeseries' },
            tickFormats: ['.0f', '.1f'],
            width: 600,
            height: 280,
            startYear: START_YEAR,
        });
    }

    protected setupPickListener(): void {
        // Map picking events are handled through the map's internal event emitter
        // Use the map's public API to handle interactions instead
    }
}

async function main() {
    try {
        const canvas = document.querySelector('canvas');
        if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas element not found.');

        const example = new OsmLayersApi();
        await example.run(canvas);
    } catch (error) {
        console.error(error);
        showError('Failed to load the Niterói case study.', 'Please verify the dataset paths and reload the page.');
    }
}

main();
