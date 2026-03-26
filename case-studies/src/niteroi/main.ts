import { AutkMap, LayerType, ColorMapInterpolator, MapEvent, VectorLayer, MapStyle } from 'autk-map';
import { SpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';
import { Scatterplot, PlotEvent, Linechart, PlotStyle } from 'autk-plot';
import { lstRegressionShader } from './lst-regression-shader';

const BAND_COUNT = 24;
const START_YEAR = 2001;
const MAX_LOT_SHAPE_AREA = 0.00001;
const HIGHLIGHT_COLOR = '#1a7a2e';

export class OsmLayersApi {
    protected map!: AutkMap;
    protected db!: SpatialDb;
    protected plot!: Scatterplot;
    protected linechart!: Linechart;
    protected geotiffData: any;
    protected roadsGeojson: any;
    protected computedRoadsGeojson: any;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadOsmFromOverpassApi({
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

        this.map = new AutkMap(canvas);
        await this.map.init();

        MapStyle.setHighlightColor(HIGHLIGHT_COLOR);
        PlotStyle.setHighlightColor(HIGHLIGHT_COLOR);

        await this.loadLayers();
        await this.applyRoadslstThematic();
        await this.loadGeoTiffLayer('lst');

        this.setupControls();
        this.setupPlot();
        this.setupPickListener();

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
        }
    }

    protected async applyLstCompute(): Promise<void> {
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
            output: { type: 'CREATE_TABLE', tableName: 'table_osm_roads', source: 'osm', tableType: LayerType.AUTK_OSM_ROADS },
        });

        const compute = new GeojsonCompute();
        const geojson = await this.db.getLayer('table_osm_roads');

        this.computedRoadsGeojson = await compute.computeFunctionIntoProperties({
            geojson,
            attributes: { bands: 'lst_timeseries' },
            attributeArrays: { bands: BAND_COUNT },
            outputColumns: ['angle', 'intercept'],
            wglsFunction: lstRegressionShader,
        });
    }

    protected updateRoadsThematic(mode: 'slope' | 'year', year?: number): void {
        const interpolator = mode === 'slope'
            ? ColorMapInterpolator.DIVERGING_RED_BLUE
            : ColorMapInterpolator.SEQUENTIAL_REDS;

        this.map.updateRenderInfoProperty('table_osm_roads', 'colorMapInterpolator', interpolator);
        this.map.updateRenderInfoProperty('table_osm_roads', 'isColorMap', true);

        this.map.updateGeoJsonLayerThematic('table_osm_roads', this.roadsGeojson, (feature) => {
            if (mode === 'slope') return feature.properties?.compute?.angle ?? 0;
            return feature.properties?.lst_timeseries?.[year! - START_YEAR] ?? 0;
        });

        const vals: number[] = this.roadsGeojson.features.map((f: any) =>
            mode === 'slope'
                ? (f.properties?.compute?.angle ?? 0)
                : (f.properties?.lst_timeseries?.[year! - START_YEAR] ?? 0)
        );
        const valMin = vals.reduce((a, b) => Math.min(a, b),  Infinity);
        const valMax = vals.reduce((a, b) => Math.max(a, b), -Infinity);
        const fmt = mode === 'slope'
            ? (v: number) => v.toExponential(2)
            : (v: number) => v.toFixed(1);
        this.map.updateRenderInfoProperty('table_osm_roads', 'colorMapLabels', [fmt(valMin), fmt(valMax)]);
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
        this.map.loadGeoTiffLayer(tableName, geotiff, LayerType.AUTK_RASTER, (cell) => {
            if (!cell) return 0;
            const props = cell as Record<string, number | bigint | string | undefined>;
            return Number(props[defaultBand] ?? NaN);
        });

        this.map.updateRenderInfoProperty(tableName, 'isSkip', true);
        this.map.updateRenderInfoProperty(tableName, 'opacity', 0.65);
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
                this.map.updateGeoTiffLayerData('lst', this.geotiffData, (cell) => {
                    if (!cell) return 0;
                    const props = cell as Record<string, number | bigint | string | undefined>;
                    return Number(props[bandName] ?? NaN);
                });
            }

            this.updateRoadsThematic(colorMode, year);
            this.map.draw();
        });
    }

    protected setupPlot(): void {
        this.plot = new Scatterplot({
            div: document.getElementById('plotBody') as HTMLElement,
            data: this.computedRoadsGeojson,
            attributes: ['compute.intercept', 'compute.angle'],
            labels: { axis: ['Baseline LST (°C)', 'Warming angle (°)'], title: 'LST regression — Niterói roads' },
            tickFormats: ['.1~f', '.3~f'],
            width: 600,
            height: 380,
            events: [PlotEvent.BRUSH],
        });

        this.plot.plotEvents.addEventListener(PlotEvent.BRUSH, (ids: number[]) => {
            const layer = this.map.layerManager.searchByLayerId('table_osm_roads') as VectorLayer;
            if (layer) layer.setHighlightedIds(ids);
            this.map.draw();
        });

        this.linechart = new Linechart({
            div: document.getElementById('lineChartBody') as HTMLElement,
            data: this.computedRoadsGeojson,
            attributes: ['lst_timeseries', 'compute.angle', 'compute.intercept'],
            labels: { axis: ['Year', 'LST (°C)'], title: 'LST timeseries — picked road segment' },
            tickFormats: ['.0f', '.1f'],
            width: 600,
            height: 280,
            startYear: START_YEAR,
        });
    }

    protected setupPickListener(): void {
        this.map.mapEvents.addEventListener(MapEvent.PICK, async (ids: number[], layerId: string) => {
            if (layerId === 'table_osm_roads') {
                this.plot?.setHighlightedIds(ids);
                this.linechart?.setHighlightedIds(ids);
            }
        });
    }
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas found');

    const example = new OsmLayersApi();
    await example.run(canvas);
}

main();
