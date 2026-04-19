import { ComputeRender } from 'autk-compute';
import { ColorMapDomainStrategy } from 'autk-core';
import { AutkSpatialDb } from 'autk-db';
import { AutkMap, LayerType, MapEvent } from 'autk-map';
import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export class ComputeRenderOsmViewScore {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    protected buildingsWithScore!: FeatureCollection<Geometry, GeoJsonProperties>;

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
    }

    public async loadCompute(): Promise<void> {
        const buildingsGeoJson = await this.db.getLayer('table_osm_buildings');
        const parksGeoJson = await this.db.getLayer('table_osm_parks');
        const waterGeoJson = await this.db.getLayer('table_osm_water');
        const renderLayers = [
            {
                layerId: 'table_osm_buildings',
                geojson: buildingsGeoJson,
                type: 'buildings' as const,
                layerType: 'buildings',
            },
            {
                layerId: 'table_osm_parks',
                geojson: parksGeoJson,
                type: 'parks' as const,
                layerType: 'parks',
            },
            {
                layerId: 'table_osm_water',
                geojson: waterGeoJson,
                type: 'water' as const,
                layerType: 'water',
            },
        ];

        const render = new ComputeRender();
        const buildingsWithClasses = await render.run({
            layers: renderLayers,
            source: buildingsGeoJson,
            aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },
            viewSampling: { directions: 36 },
            tileSize: 32,
        });

        this.buildingsWithScore = {
            ...buildingsWithClasses,
            features: buildingsWithClasses.features
                .filter((building: Feature): building is Feature<Geometry, GeoJsonProperties> => building.geometry !== null)
                .map((building: Feature) => {
                    const classMetrics = ((building.properties as any)?.compute?.render ?? {}) as Record<string, unknown>;
                    const classes = (classMetrics.classes ?? {}) as Record<string, number>;
                    const parksVisibility = Number(classes.parks ?? 0);
                    const waterVisibility = Number(classes.water ?? 0);
                    const skyVisibility = Number(classes.sky ?? 0);
                    const viewScore = waterVisibility * 0.2 + parksVisibility * 0.35 + skyVisibility * 0.45;

                    return {
                        ...building,
                        properties: {
                            ...building.properties,
                            compute: {
                                ...(building.properties?.compute ?? {}),
                                parksVisibility,
                                waterVisibility,
                                skyVisibility,
                                viewScore,
                            },
                        },
                    };
                }),
        };
    }

    public async loadMap(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();
        this.updateMapListeners();
        this.renderSummary();

        this.map.updateColorMap('table_osm_buildings', {
            colorMap: {
                domainSpec: { type: ColorMapDomainStrategy.PERCENTILE, params: [5, 95] },
            },
        });

        this.map.updateThematic('table_osm_buildings', {
            collection: this.buildingsWithScore,
            property: 'properties.compute.viewScore',
        });

        this.map.updateRenderInfo('table_osm_buildings', { isColorMap: true, isPick: true, opacity: 0.95 });
        this.map.draw();
    }

    protected updateMapListeners(): void {
        this.map.events.on(MapEvent.PICKING, ({ selection, layerId }) => {
            if (layerId !== 'table_osm_buildings') return;

            if (selection.length === 0) {
                this.renderSummary();
                return;
            }

            const pickedId = selection[selection.length - 1];
            const building = this.buildingsWithScore.features[pickedId];
            if (!building) {
                this.renderSummary();
                return;
            }

            const compute = ((building.properties as any)?.compute ?? {}) as Record<string, number>;
            this.updateInfoPanel({
                title: `Building ${pickedId}`,
                buildingId: resolveBuildingId(building, pickedId),
                buildingHeight: resolveBuildingHeight(building),
                parksVisibility: Number(compute.parksVisibility ?? 0),
                waterVisibility: Number(compute.waterVisibility ?? 0),
                skyVisibility: Number(compute.skyVisibility ?? 0),
                viewScore: Number(compute.viewScore ?? 0),
            });
        });
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = layerData.name === 'table_osm_buildings'
                ? this.buildingsWithScore
                : await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        await this.loadDb();
        await this.loadCompute();
        await this.loadMap(canvas);
    }

    protected renderSummary(): void {
        const scores = this.buildingsWithScore.features.map((feature) => {
            const compute = ((feature.properties as any)?.compute ?? {}) as Record<string, number>;
            return {
                parksVisibility: Number(compute.parksVisibility ?? 0),
                waterVisibility: Number(compute.waterVisibility ?? 0),
                skyVisibility: Number(compute.skyVisibility ?? 0),
                viewScore: Number(compute.viewScore ?? 0),
            };
        });

        const count = Math.max(1, scores.length);
        const avgParks = scores.reduce((sum, item) => sum + item.parksVisibility, 0) / count;
        const avgWater = scores.reduce((sum, item) => sum + item.waterVisibility, 0) / count;
        const avgSky = scores.reduce((sum, item) => sum + item.skyVisibility, 0) / count;
        const avgScore = scores.reduce((sum, item) => sum + item.viewScore, 0) / count;

        this.updateInfoPanel({
            title: 'Dataset Average',
            buildingId: '—',
            buildingHeight: null,
            parksVisibility: avgParks,
            waterVisibility: avgWater,
            skyVisibility: avgSky,
            viewScore: avgScore,
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

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

function resolveBuildingId(feature: Feature<Geometry, GeoJsonProperties>, fallbackIndex: number): string {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const candidates = [props.id, props.osm_id, props['@id'], props.name];

    for (const candidate of candidates) {
        if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
            return String(candidate);
        }
    }

    return String(fallbackIndex);
}

function resolveBuildingHeight(feature: Feature<Geometry, GeoJsonProperties>): number | null {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const rawHeight = Number.parseFloat(String(props.height ?? props['building:height'] ?? ''));
    if (Number.isFinite(rawHeight) && rawHeight > 0) {
        return rawHeight;
    }

    const rawLevels = Number.parseFloat(String(props['building:levels'] ?? props.levels ?? ''));
    if (Number.isFinite(rawLevels) && rawLevels > 0) {
        return rawLevels * 3.4;
    }

    return null;
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
