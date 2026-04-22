import { Feature, FeatureCollection, GeoJsonProperties, Point } from 'geojson';

import { AutkSpatialDb } from 'autk-db';
import { ComputeRender } from 'autk-compute';
import { AutkMap, LayerType, MapEvent } from 'autk-map';
import { ColorMapDomainStrategy } from 'autk-core';

export class ComputeRenderOsmVisibility {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    protected buildings!: FeatureCollection;
    protected buildingsForCompute!: FeatureCollection;
    protected buildingsWithVisibility!: FeatureCollection;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        await this.loadDb();
        await this.loadMap(canvas);
        this.updateMapListeners();
        this.map.draw();
    }

    protected async loadDb(): Promise<void> {
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
        this.buildingsForCompute = {
            ...this.buildings,
            features: this.buildings.features.map((feature, index) => ({
                ...feature,
                properties: {
                    ...feature.properties,
                    _renderObjectId: index,
                },
            })),
        };
        this.buildingsWithVisibility = this.resetVisibility();
    }

    protected async loadMap(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();

        for (const layerData of this.db.getLayerTables()) {
            const geojson = layerData.name === 'table_osm_buildings'
                ? this.buildingsWithVisibility
                : await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateColorMap('table_osm_buildings', {
            colorMap: {
                domainSpec: { type: ColorMapDomainStrategy.MIN_MAX },
            },
        });
        this.map.updateThematic('table_osm_buildings', {
            collection: this.buildingsWithVisibility,
            property: 'properties.compute.visibilityValue',
        });
        this.map.updateRenderInfo('table_osm_buildings', { isColorMap: true, isPick: true, opacity: 0.92 });
    }

    protected updateMapListeners(): void {
        this.map.events.on(MapEvent.PICKING, async ({ selection, layerId }) => {
            if (layerId !== 'table_osm_buildings') return;

            if (selection.length === 0) {
                this.buildingsWithVisibility = this.resetVisibility();
                this.refreshBuildingsLayer();
                return;
            }

            const pickedId = selection[selection.length - 1];
            await this.computeVisibilityFromBuilding(pickedId);
        });
    }

    protected async computeVisibilityFromBuilding(pickedId: number): Promise<void> {
        const pickedFeature = this.buildingsForCompute.features[pickedId];
        if (!pickedFeature) return;

        const footprint = resolveBuildingFootprint(pickedFeature);
        if (!footprint) {
            console.warn(`Visibility: no valid footprint for picked building ${pickedId}.`);
            return;
        }

        const height = resolveBuildingHeight(pickedFeature);
        const viewpoints = buildVerticalViewpoints(footprint, height);
        const sceneBuildings = {
            ...this.buildingsForCompute,
            // The viewpoints are placed inside the picked building volume, so keep that
            // building out of the rendered scene to avoid self-occluding nearby buildings.
            features: this.buildingsForCompute.features.filter((_, index) => index !== pickedId),
        };
        const render = new ComputeRender();

        const pointResults = await render.run({
            layers: [{
                layerId: 'table_osm_buildings',
                geojson: sceneBuildings,
                layerType: 'buildings',
                objectIdProperty: '_renderObjectId',
            }],
            source: viewpoints,
            aggregation: { type: 'objects' },
            viewSampling: { directions: 36 },
            tileSize: 64,
        });

        const visibilityScores = new Map<number, number>();
        for (const feature of pointResults.features) {
            const objects = (feature.properties as any)?.compute?.render?.objects ?? {};
            for (const key of Object.keys(objects)) {
                const metric = objects[key];
                if (!metric?.visible) continue;
                const id = parseObjectKey(key);
                if (id !== null && id !== pickedId) {
                    const score = Number(metric.sampleRatio ?? 0);
                    visibilityScores.set(id, (visibilityScores.get(id) ?? 0) + score);
                }
            }
        }

        const pointCount = Math.max(1, pointResults.features.length);

        this.buildingsWithVisibility = {
            ...this.buildings,
            features: this.buildings.features.map((feature, index) => ({
                ...feature,
                properties: {
                    ...feature.properties,
                    compute: {
                        ...(feature.properties?.compute ?? {}),
                        visibility: (visibilityScores.get(index) ?? 0) > 0,
                        visibilityScore: (visibilityScores.get(index) ?? 0) / pointCount,
                        visibilityValue: (visibilityScores.get(index) ?? 0) / pointCount,
                    },
                },
            })),
        };

        this.refreshBuildingsLayer();
    }

    protected resetVisibility(): FeatureCollection {
        return {
            ...this.buildings,
            features: this.buildings.features.map((feature) => ({
                ...feature,
                properties: {
                    ...feature.properties,
                    compute: {
                        ...(feature.properties?.compute ?? {}),
                        visibility: false,
                        visibilityScore: 0,
                        visibilityValue: 0,
                    },
                },
            })),
        };
    }

    protected refreshBuildingsLayer(): void {
        this.map.updateThematic('table_osm_buildings', {
            collection: this.buildingsWithVisibility,
            property: 'properties.compute.visibilityValue',
        });
        this.map.updateRenderInfo('table_osm_buildings', { isColorMap: true, isPick: true });
    }

}

function buildVerticalViewpoints(footprint: number[][], height: number): FeatureCollection<Point> {
    const [x, y] = barycenter(footprint);
    const floorHeight = 3.4;
    const sampleCount = Math.max(1, Math.round(height / floorHeight));
    const features: Array<Feature<Point>> = [];

    for (let i = 0; i < sampleCount; i++) {
        const z = sampleCount === 1
            ? Math.min(height, 1.7)
            : (height * i) / (sampleCount - 1);
        features.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [x, y, z],
            },
            properties: { level: i, z },
        });
    }

    return { type: 'FeatureCollection', features };
}

function barycenter(ring: number[][]): [number, number] {
    let x = 0;
    let y = 0;
    for (const [px, py] of ring) {
        x += px;
        y += py;
    }
    return [x / ring.length, y / ring.length];
}

function resolveBuildingFootprint(feature: Feature): number[][] | null {
    const geometry = feature.geometry;
    if (!geometry) return null;

    let bestRing: number[][] | null = null;
    let bestArea = -1;

    const consider = (ring: number[][] | undefined) => {
        if (!ring || ring.length < 3) return;
        const area = Math.abs(computeRingArea(ring));
        if (area > bestArea) {
            bestArea = area;
            bestRing = ring;
        }
    };

    const scan = (geom: any) => {
        if (geom.type === 'Polygon') {
            consider(geom.coordinates[0]);
            return;
        }
        if (geom.type === 'MultiPolygon') {
            for (const polygon of geom.coordinates) consider(polygon[0]);
        }
    };

    if (geometry.type === 'GeometryCollection') {
        for (const part of geometry.geometries) scan(part);
    } else {
        scan(geometry);
    }

    return bestRing;
}

function computeRingArea(ring: number[][]): number {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        area += x1 * y2 - x2 * y1;
    }
    return area * 0.5;
}

function resolveBuildingHeight(feature: Feature): number {
    const rootProps = (feature.properties ?? {}) as Record<string, unknown>;
    const parts = Array.isArray(rootProps.parts) ? (rootProps.parts as GeoJsonProperties[]) : [];

    const parseHeight = (props?: GeoJsonProperties): number | null => {
        if (!props) return null;
        const rawHeight = parseFloat(String(props.height ?? props['building:height'] ?? ''));
        const rawLevels = parseFloat(String(props['building:levels'] ?? props.levels ?? '')) * 3.4;
        const value = Number.isFinite(rawHeight) && rawHeight > 0
            ? rawHeight
            : Number.isFinite(rawLevels) && rawLevels > 0
                ? rawLevels
                : NaN;
        return Number.isFinite(value) && value > 0 ? value : null;
    };

    const partHeights = parts
        .map((part) => parseHeight(part))
        .filter((value): value is number => value !== null);

    if (partHeights.length > 0) {
        return Math.max(...partHeights);
    }

    return parseHeight(rootProps as GeoJsonProperties) ?? 20;
}

function parseObjectKey(key: string): number | null {
    const separator = key.indexOf(':');
    if (separator < 0) return null;
    const raw = decodeURIComponent(key.slice(separator + 1));
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new ComputeRenderOsmVisibility();
    await example.run(canvas);
}
main();
