import {
    ComputeRender,
} from 'autk-compute';

import {
    ColorMapDomainStrategy,
    TriangulatorBuildingWithWindows,
} from 'autk-core';

import {
    AutkMap,
    LayerType,
    MapEvent,
} from 'autk-map';

import { AutkSpatialDb } from 'autk-db';

import type { LayerThematic } from 'autk-map';

import { Feature, FeatureCollection, Point } from 'geojson';

const GENERATED_LAYER_ID = 'selected_building_windows';

export class ComputeRenderOsmViewScore {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;
    protected buildings!: FeatureCollection;

    private readonly analysisFloors = 10;
    private analysisVersion = 0;

    public async loadDb(): Promise<void> {
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
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        this.buildings = await this.db.getLayer('table_osm_buildings');
    }

    public async loadMap(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();
        this.updateMapListeners();

        this.map.updateRenderInfo('table_osm_buildings', { isPick: true, opacity: 0.94 });
        this.renderSummary();
        this.map.draw();
    }

    protected updateMapListeners(): void {
        this.map.events.on(MapEvent.PICKING, async ({ selection, layerId }) => {
            if (layerId !== 'table_osm_buildings') return;

            if (selection.length === 0) {
                this.analysisVersion += 1;
                this.clearSelectionState();
                return;
            }

            const pickedId = selection[selection.length - 1];
            if (selection.length > 1) {
                this.map.setHighlightedIds('table_osm_buildings', [pickedId]);
            }
            await this.analyzePickedBuilding(pickedId);
        });
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = layerData.name === 'table_osm_buildings'
                ? this.buildings
                : await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
        }
    }

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        await this.loadDb();
        await this.loadMap(canvas);
    }

    protected async analyzePickedBuilding(pickedId: number): Promise<void> {
        const requestId = ++this.analysisVersion;
        const pickedBuilding = this.buildings.features[pickedId];
        if (!pickedBuilding) {
            this.clearSelectionState();
            return;
        }

        this.map.clearSkippedIds('table_osm_buildings');
        this.map.setSkippedIds('table_osm_buildings', [pickedId]);
        this.map.removeLayer(GENERATED_LAYER_ID);

        const pickedCollection: FeatureCollection = {
            type: 'FeatureCollection',
            features: [pickedBuilding],
        };
        const layout = TriangulatorBuildingWithWindows.buildWindowLayout(pickedCollection, this.analysisFloors);
        if (layout.collection.features.length === 0) {
            this.clearSelectionState();
            return;
        }

        const parksGeoJson = await this.db.getLayer('table_osm_parks');
        const waterGeoJson = await this.db.getLayer('table_osm_water');
        const sceneBuildings: FeatureCollection = {
            ...this.buildings,
            features: this.buildings.features.filter((_, index) => index !== pickedId),
        };

        const render = new ComputeRender();
        const windowScores = await render.run({
            layers: [
                {
                    layerId: 'table_osm_buildings',
                    geojson: sceneBuildings,
                    type: 'buildings',
                    layerType: 'buildings',
                },
                {
                    layerId: 'table_osm_parks',
                    geojson: parksGeoJson,
                    type: 'parks',
                    layerType: 'parks',
                },
                {
                    layerId: 'table_osm_water',
                    geojson: waterGeoJson,
                    type: 'water',
                    layerType: 'water',
                },
            ],
            source: pickedCollection,
            viewpoints: { type: 'building-windows', floors: this.analysisFloors },
            aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },
            tileSize: 32,
        });

        if (requestId !== this.analysisVersion) {
            return;
        }

        const thematicByWindowId = new Map<string, WindowMetric>();
        for (const feature of windowScores.features as Array<Feature<Point>>) {
            const windowId = String(feature.properties?.windowId ?? '');
            if (!windowId) continue;

            const classMetrics = ((feature.properties as any)?.compute?.render ?? {}) as Record<string, unknown>;
            const classes = (classMetrics.classes ?? {}) as Record<string, number>;
            const parksVisibility = Number(classes.parks ?? 0);
            const waterVisibility = Number(classes.water ?? 0);
            const skyVisibility = Number(classes.sky ?? 0);
            const viewScore = waterVisibility * 0.2 + parksVisibility * 0.35 + skyVisibility * 0.45;

            thematicByWindowId.set(windowId, {
                parksVisibility,
                waterVisibility,
                skyVisibility,
                viewScore,
            });
        }

        const mesh = buildAnalysisBuildingMesh({
            collection: pickedCollection,
            origin: this.map.layerManager.origin as [number, number],
            floors: this.analysisFloors,
            thematicByWindowId,
        });
        if (!mesh) {
            this.clearSelectionState();
            return;
        }

        this.map.loadMesh(GENERATED_LAYER_ID, mesh);
        this.map.updateColorMap(GENERATED_LAYER_ID, {
            colorMap: {
                domainSpec: { type: ColorMapDomainStrategy.PERCENTILE, params: [5, 95] },
            },
        });
        this.map.updateRenderInfo(GENERATED_LAYER_ID, { isColorMap: true, opacity: 1.0 });

        this.updateSelectedBuildingInfo(pickedBuilding, pickedId, thematicByWindowId);
    }

    protected clearSelectionState(): void {
        this.map.clearSkippedIds('table_osm_buildings');
        this.map.removeLayer(GENERATED_LAYER_ID);
        this.renderSummary();
    }

    protected updateSelectedBuildingInfo(
        building: Feature,
        pickedId: number,
        thematicByWindowId: Map<string, WindowMetric>,
    ): void {
        const values = Array.from(thematicByWindowId.values());
        const count = Math.max(1, values.length);
        const avgParks = values.reduce((sum, item) => sum + item.parksVisibility, 0) / count;
        const avgWater = values.reduce((sum, item) => sum + item.waterVisibility, 0) / count;
        const avgSky = values.reduce((sum, item) => sum + item.skyVisibility, 0) / count;
        const avgScore = values.reduce((sum, item) => sum + item.viewScore, 0) / count;

        this.updateInfoPanel({
            title: `Building ${pickedId}`,
            buildingId: resolveBuildingId(building, pickedId),
            buildingHeight: TriangulatorBuildingWithWindows.resolveHeight(building),
            parksVisibility: avgParks,
            waterVisibility: avgWater,
            skyVisibility: avgSky,
            viewScore: avgScore,
        });
    }

    protected renderSummary(): void {
        this.updateInfoPanel({
            title: 'Pick a Building',
            buildingId: '—',
            buildingHeight: null,
            parksVisibility: 0,
            waterVisibility: 0,
            skyVisibility: 0,
            viewScore: 0,
        });
    }

    protected updateInfoPanel(values: {
        title: string;
        buildingId: string;
        buildingHeight: number | null;
        parksVisibility: number;
        waterVisibility: number;
        skyVisibility: number;
        viewScore: number;
    }): void {
        const title = document.getElementById('info-title');
        const buildingId = document.getElementById('info-building-id');
        const buildingHeight = document.getElementById('info-building-height');
        const parks = document.getElementById('info-parks');
        const water = document.getElementById('info-water');
        const sky = document.getElementById('info-sky');
        const score = document.getElementById('info-score');

        if (title) title.textContent = values.title;
        if (buildingId) buildingId.textContent = values.buildingId;
        if (buildingHeight) {
            buildingHeight.textContent = values.buildingHeight === null
                ? '—'
                : `${values.buildingHeight.toFixed(1)} m`;
        }
        if (parks) parks.textContent = formatPercent(values.parksVisibility);
        if (water) water.textContent = formatPercent(values.waterVisibility);
        if (sky) sky.textContent = formatPercent(values.skyVisibility);
        if (score) score.textContent = values.viewScore.toFixed(3);
    }
}

type WindowMetric = {
    parksVisibility: number;
    waterVisibility: number;
    skyVisibility: number;
    viewScore: number;
};

type MeshBuildParams = {
    collection: FeatureCollection;
    origin: [number, number];
    floors: number;
    thematicByWindowId: Map<string, WindowMetric>;
};

function buildAnalysisBuildingMesh(params: MeshBuildParams): {
    geometry: ReturnType<typeof TriangulatorBuildingWithWindows.buildMesh>[0];
    components: ReturnType<typeof TriangulatorBuildingWithWindows.buildMesh>[1];
    thematic: LayerThematic[];
    type: 'buildings';
} | null {
    const [geometry, components] = TriangulatorBuildingWithWindows.buildMesh(
        params.collection,
        params.origin,
        params.floors,
    );
    if (geometry.length === 0 || components.length === 0) {
        return null;
    }

    const thematic: LayerThematic[] = components.map((component) => {
        if (!component.featureId) {
            return { value: 0, valid: 0 };
        }

        const score = params.thematicByWindowId.get(String(component.featureId))?.viewScore ?? 0;
        return { value: score, valid: 1 };
    });

    return { geometry, components, thematic, type: 'buildings' };
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function resolveBuildingId(feature: Feature, fallbackIndex: number): string {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const candidates = [props.id, props.osm_id, props['@id'], props.name];

    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
            return String(candidate);
        }
    }

    return String(fallbackIndex);
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new ComputeRenderOsmViewScore();
    await example.run(canvas);
}
main();
