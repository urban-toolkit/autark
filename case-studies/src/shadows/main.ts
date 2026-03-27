
import { Feature, FeatureCollection } from 'geojson';

function setLoadingState(message: string, note?: string): void {
    const text = document.getElementById('loading-text');
    const noteEl = document.getElementById('loading-note');
    if (text) text.textContent = message;
    if (noteEl) noteEl.textContent = note ?? '';
}

function hideLoading(): void {
    document.getElementById('loading-overlay')?.classList.add('hidden');
}

function showError(message: string, note?: string): void {
    const overlay = document.getElementById('loading-overlay');
    const title = document.getElementById('loading-title');
    const text = document.getElementById('loading-text');
    const noteEl = document.getElementById('loading-note');
    overlay?.classList.remove('hidden');
    overlay?.classList.add('error');
    if (title) title.textContent = 'Loading Error';
    if (text) text.textContent = message;
    if (noteEl) noteEl.textContent = note ?? 'Please reload the page and try again.';
}

import { SpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';
import { AutkMap, LayerType, MapEvent, VectorLayer } from 'autk-map';
import { Barchart, PlotEvent } from 'autk-plot';

import splitRoadsQuery from './split-roads.sql?raw';
import shadowShader from './shadow-shader.wgsl?raw';

export class Shadows {
    protected map!: AutkMap;
    protected db!: SpatialDb;
    protected histogram!: Barchart;

    protected readonly ROADS_LAYER = 'table_roads_20m';

    protected roads!: FeatureCollection;
    protected buildings!: FeatureCollection;
    protected computedRoads?: FeatureCollection;

    protected selectedBuildingId: number | null = null;
    protected selectedBuildingRing: number[][] | null = null;
    protected selectedBuildingHeight: number = 0;

    protected currentMonth: string = 'jun';
    protected displayMode: 'heatmap' | 'compute' | 'contribution' = 'heatmap';

    // Maps GPU component index (group index) → first feature index for that group.
    // The GPU pick ID is a group index (features sharing building_id are collapsed into
    // one group by TriangulatorBuildings), so we cannot use it directly as a feature index.
    protected buildingGroupToFeatureIndex: Map<number, number> = new Map();

    protected histogramDiv!: HTMLElement;

    public async run(canvas: HTMLCanvasElement, histogramDiv: HTMLElement): Promise<void> {
        this.histogramDiv = histogramDiv;

        await this.loadDb();
        await this.loadMap(canvas);

        this.updateThematicData();
        this.reloadHistogram();
        this.updateHistogramListeners();
    }

    // ── Database ──────────────────────────────────────────────────────────────

    protected async loadDb(): Promise<void> {
        setLoadingState('Initializing spatial database...', 'Preparing the in-browser data environment.');
        this.db = new SpatialDb();
        await this.db.init();

        setLoadingState('Loading OpenStreetMap data...', 'Fetching Chicago Loop from Overpass API.');
        await this.db.loadOsmFromOverpassApi({
            queryArea: {
                geocodeArea: 'Chicago',
                areas: ['Loop', 'Near South Side'],
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

        setLoadingState('Loading shadow measurements...', 'Importing accumulated shadow data.');
        await this.db.loadCsv({
            csvFileUrl: `http://localhost:5173/data/shadows_chicago.csv`,
            outputTableName: 'shadows',
            geometryColumns: {
                latColumnName: 'latitude',
                longColumnName: 'longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        setLoadingState('Splitting road segments...', 'Dividing roads into 20 m segments.');
        await this.db.rawQuery({
            query: splitRoadsQuery,
            output: {
                type: 'CREATE_TABLE',
                tableName: this.ROADS_LAYER,
                source: 'user',
                tableType: LayerType.AUTK_OSM_ROADS,
            },
        });

        setLoadingState('Computing shadow joins...', 'Linking shadow measurements to road segments for each season.');
        for (const month of ['jun', 'sep', 'dez']) {
            await this.db.spatialJoin({
                tableRootName: this.ROADS_LAYER,
                tableJoinName: 'shadows',
                spatialPredicate: 'NEAR',
                nearDistance: 200,
                output: { type: 'MODIFY_ROOT' },
                joinType: 'LEFT',
                groupBy: {
                    selectColumns: [{
                        tableName: 'shadows',
                        column: month,
                        aggregateFn: 'avg',
                        aggregateFnResultColumnName: month,
                    }],
                },
            });
        }

        this.roads     = await this.db.getLayer(this.ROADS_LAYER);
        this.buildings = await this.db.getLayer('table_osm_buildings');
        this.computeBuildingGroupMapping();
    }

    protected computeBuildingGroupMapping(): void {
        let groupIdx = 0;
        const seenBuildingIds = new Set<string>();
        for (let i = 0; i < this.buildings.features.length; i++) {
            const props = this.buildings.features[i].properties;
            const key = props ? String(props['building_id'] ?? '-1') : '-1';
            if (!seenBuildingIds.has(key)) {
                this.buildingGroupToFeatureIndex.set(groupIdx, i);
                seenBuildingIds.add(key);
                groupIdx++;
            }
        }
    }

    protected monthToDoy(month: string): number {
        const map: Record<string, number> = {
            jun: 172,  // June 21 — summer solstice
            sep: 265,  // September 22 — autumnal equinox
            dez: 355,  // December 21 — winter solstice
        };
        return map[month] ?? 172;
    }

    public async computeShadows(footprint: number[][], height: number, month: string): Promise<void> {
        const doy = this.monthToDoy(month);

        // seg, sjoin_avg are per-feature. bld_height, doy, ring are global uniforms.
        // Buffer count: seg auto matrix (1) + varrows (1) + sjoin_avg scalar (1)
        //             + uniforms: bld_height, doy (2) + ring (1) + 2 outputs = 8.
        const geojsonCompute = new GeojsonCompute();
        const result = await geojsonCompute.computeFunctionIntoProperties({
            geojson: this.roads,
            attributes: {
                seg:       'geometry.coordinates',
                sjoin_avg: `sjoin.avg.${month}`,
            },
            attributeMatrices: {
                seg: { rows: 'auto', cols: 2 },
            },
            uniforms: {
                bld_height: height,
                doy,
            },
            uniformMatrices: {
                ring: { data: footprint, cols: 2 },
            },
            outputColumns: ['shadow', 'contribution'],
            wglsFunction: shadowShader,
        });

        this.computedRoads = result;
    }

    // ── Map ───────────────────────────────────────────────────────────────────

    protected async loadMap(canvas: HTMLCanvasElement): Promise<void> {
        setLoadingState('Initializing map...', 'Preparing the WebGPU rendering context.');
        this.map = new AutkMap(canvas);
        await this.map.init();

        setLoadingState('Rendering layers...', 'Uploading geometry to the GPU.');
        for (const layerData of this.db.getLayerTables()) {
            // Skip the original un-split roads; we use the 20 m version instead.
            if (layerData.name === 'table_osm_roads') continue;

            const layer = await this.db.getLayer(layerData.name);

            if (layerData.name === 'heatmap') {
                await this.map.loadGeoTiffLayer(layerData.name, layer, LayerType.AUTK_RASTER,
                    (cell: unknown) => (cell as { avg: { shadows: number } })?.avg?.shadows || 0
                );
                this.map.updateRenderInfoProperty(layerData.name, 'opacity', 0.5);
                this.map.updateRenderInfoProperty(layerData.name, 'isColorMap', true);
                this.map.updateRenderInfoProperty(layerData.name, 'isSkip', true);
            }
            else {
                this.map.loadGeoJsonLayer(layerData.name, layer, layerData.type as LayerType);
            }

        }

        this.map.updateRenderInfoProperty('table_osm_buildings', 'isPick', true);
        this.map.mapEvents.addEventListener(MapEvent.PICK, (ids, layerId) => {
            if (layerId !== 'table_osm_buildings') return;

            if (ids.length === 0) {
                // Building was deselected — clear stored geometry and computed result.
                this.selectedBuildingId     = null;
                this.selectedBuildingRing   = null;
                this.selectedBuildingHeight = 0;
                this.computedRoads          = undefined;
                if (this.displayMode === 'compute' || this.displayMode === 'contribution') {
                    this.updateThematicData();
                }
                return;
            }

            // ids is the post-toggle highlighted set. Find the newly added building
            // (the one that differs from the previously selected one).
            const newId = ids.find(id => id !== this.selectedBuildingId) ?? ids[0];
            this.onBuildingPick(newId);
        });

        this.map.draw();
    }

    protected async onBuildingPick(id: number): Promise<void> {
        const featureIndex = this.buildingGroupToFeatureIndex.get(id) ?? id;
        const feature = this.buildings.features[featureIndex];
        if (!feature) return;

        this.selectedBuildingId = id;

        // Enforce single-selection: clear any previously highlighted building.
        const buildingsLayer = this.map.layerManager.searchByLayerId('table_osm_buildings') as VectorLayer;
        buildingsLayer?.setHighlightedIds([id]);

        // Extract outer ring of the footprint (handles Polygon and MultiPolygon).
        const geom = feature.geometry as any;
        const ring: number[][] = geom.type === 'MultiPolygon'
            ? geom.coordinates[0][0]
            : geom.coordinates[0];

        // Building height: use OSM `height` tag, fall back to `building:levels` × 3 m, then 20 m.
        const props = feature.properties ?? {};
        const rawHeight  = parseFloat(props['height']);
        const rawLevels  = parseFloat(props['building:levels']) * 3;
        const height = isFinite(rawHeight) && rawHeight > 0 ? rawHeight
                   : isFinite(rawLevels) && rawLevels > 0 ? rawLevels
                   : 20;

        this.selectedBuildingRing   = ring;
        this.selectedBuildingHeight = height;

        await this.computeShadows(ring, height, this.currentMonth);

        if (this.displayMode === 'compute' || this.displayMode === 'contribution') {
            this.updateThematicData();
        }
    }

    protected updateThematicData(): void {
        if (this.displayMode === 'heatmap') {
            const getFnv = (feature: Feature) =>
                (feature.properties?.sjoin as any)?.avg?.[this.currentMonth] || 0;
            this.map.updateGeoJsonLayerThematic(this.ROADS_LAYER, this.roads, getFnv);
            this.map.updateRenderInfoProperty(this.ROADS_LAYER, 'isPick', true);
            this.map.updateRenderInfoProperty(this.ROADS_LAYER, 'isColorMap', true);
            this.map.draw();
            return;
        }

        // 'compute' or 'contribution' mode
        const key = this.displayMode === 'compute' ? 'shadow' : 'contribution';
        const source = this.computedRoads ?? this.roads;
        const getFnv = this.computedRoads
            ? (feature: Feature) => feature.properties?.compute?.[key] ?? 0
            : () => 0;
        this.map.updateGeoJsonLayerThematic(this.ROADS_LAYER, source, getFnv);
        this.map.updateRenderInfoProperty(this.ROADS_LAYER, 'isColorMap', true);
        this.map.draw();
    }

    public async changeMonth(month: string): Promise<void> {
        this.currentMonth = month;

        const roadsLayer = this.map.layerManager.searchByLayerId(this.ROADS_LAYER) as VectorLayer;
        roadsLayer?.clearHighlightedIds();

        // Recompute accumulated shadows for the new date if a building is selected.
        if (this.selectedBuildingRing) {
            await this.computeShadows(this.selectedBuildingRing, this.selectedBuildingHeight, month);
        }

        this.reloadHistogram();
        this.updateHistogramListeners();
        this.updateThematicData();
    }

    public changeDisplayMode(mode: 'heatmap' | 'compute' | 'contribution'): void {
        this.displayMode = mode;

        const roadsLayer = this.map.layerManager.searchByLayerId(this.ROADS_LAYER) as VectorLayer;
        roadsLayer?.clearHighlightedIds();

        this.updateThematicData();
    }

    // ── Histogram ─────────────────────────────────────────────────────────────

    protected reloadHistogram(): void {
        this.histogramDiv.innerHTML = '';

        this.histogram = new Barchart({
            div: this.histogramDiv,
            data: this.roads,
            labels: { axis: ['Hours of shadow', '#Road segments'], title: 'Shadow distribution' },
            width: 600,
            height: 380,
            events: [PlotEvent.BRUSH_X],
            histogram: {
                column: `sjoin.avg.${this.currentMonth}`,
                numBins: 13,
                divisor: 60,
                labelSuffix: 'h',
            },
        });
    }

    protected updateHistogramListeners(): void {
        this.histogram.plotEvents.addEventListener(PlotEvent.BRUSH_X, (roadIds: number[]) => {
            const layer = this.map.layerManager.searchByLayerId(this.ROADS_LAYER);
            (<VectorLayer>layer)?.setHighlightedIds(roadIds);
            this.map.draw();
        });
    }

}

async function main() {
    try {
        const canvas = document.querySelector('canvas');
        const histogramDiv = document.querySelector('#histogramBody') as HTMLElement;

        if (!(canvas instanceof HTMLCanvasElement) || !histogramDiv) {
            throw new Error('Canvas or histogram element not found.');
        }

        const shadows = new Shadows();
        await shadows.run(canvas, histogramDiv);

        (window as any).shadows = shadows;
        hideLoading();
        window.dispatchEvent(new CustomEvent('shadows-ready'));
    } catch (error) {
        console.error(error);
        showError('Failed to load the Shadows case study.', 'Please verify the dataset paths and reload the page.');
    }
}
main();
