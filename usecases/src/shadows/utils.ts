import { Feature, FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

/** Supported month codes used by this shadows example. */
export type MonthCode = 'jun' | 'sep' | 'dez';

/**
 * Ordered month metadata used for DB aggregation loops and UI normalization.
 */
export const MONTH_CONFIG: ReadonlyArray<{ code: MonthCode; doy: number }> = [
    { code: 'jun', doy: 172 },
    { code: 'sep', doy: 265 },
    { code: 'dez', doy: 355 },
];

/** Default month used when UI input is missing or invalid. */
export const DEFAULT_MONTH: MonthCode = 'jun';

/** Month -> day-of-year mapping used by analytical shader uniforms. */
export const MONTH_DOY: Record<MonthCode, number> = {
    jun: 172,
    sep: 265,
    dez: 355,
};

/**
 * Runtime type guard for month values coming from UI controls.
 *
 * @param value Raw string value from month selector.
 * @returns `true` when value is one of the supported month codes.
 */
export function isMonthCode(value: string): value is MonthCode {
    return MONTH_CONFIG.some(item => item.code === value);
}

/**
 * Computes signed polygon area for a ring using the shoelace formula.
 *
 * @param ring Coordinate ring as `[x, y]` points.
 * @returns Signed area; caller can apply `Math.abs` when needed.
 */
export function computeRingArea(ring: number[][]): number {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        area += x1 * y2 - x2 * y1;
    }
    return area * 0.5;
}

/**
 * Resolves a representative building footprint ring from a feature.
 *
 * Supports Polygon, MultiPolygon and GeometryCollection containers. When
 * multiple polygon rings are found, the largest-by-area outer ring is chosen.
 *
 * @param feature Picked building feature.
 * @returns Selected footprint ring or `null` when no polygonal footprint exists.
 */
export function resolveBuildingFootprint(feature: Feature): number[][] | null {
    const geom = feature.geometry as Geometry | null;
    if (!geom) return null;

    let bestRing: number[][] | null = null;
    let bestArea = -1;

    const considerRing = (ring: number[][] | undefined) => {
        if (!ring || ring.length < 3) return;
        const area = Math.abs(computeRingArea(ring));
        if (area > bestArea) {
            bestArea = area;
            bestRing = ring;
        }
    };

    const scanGeometry = (geometry: Geometry) => {
        if (geometry.type === 'Polygon') {
            considerRing(geometry.coordinates[0]);
            return;
        }
        if (geometry.type === 'MultiPolygon') {
            for (const polygon of geometry.coordinates) {
                considerRing(polygon[0]);
            }
        }
    };

    if (geom.type === 'GeometryCollection') {
        for (const part of geom.geometries) {
            scanGeometry(part as Geometry);
        }
    } else {
        scanGeometry(geom);
    }

    return bestRing;
}

/**
 * Resolves building height from OSM-like properties.
 *
 * Priority:
 * 1) max of part-level heights/levels (when `properties.parts` exists)
 * 2) root-level height/levels
 * 3) default fallback (20 m)
 *
 * @param feature Building feature.
 * @returns Height in meters.
 */
export function resolveBuildingHeight(feature: Feature): number {
    const rootProps = (feature.properties ?? {}) as Record<string, unknown>;
    const parts = Array.isArray(rootProps['parts']) ? (rootProps['parts'] as GeoJsonProperties[]) : [];

    const parseHeight = (source: GeoJsonProperties | undefined): number | null => {
        if (!source) return null;
        const rawHeight = parseFloat(String(source['height'] ?? source['building:height'] ?? ''));
        const rawLevels = parseFloat(String(source['building:levels'] ?? source['levels'] ?? '')) * 3;
        const value = isFinite(rawHeight) && rawHeight > 0 ? rawHeight
            : isFinite(rawLevels) && rawLevels > 0 ? rawLevels
                : NaN;
        return isFinite(value) && value > 0 ? value : null;
    };

    const partHeights = parts
        .map(part => parseHeight(part))
        .filter((value): value is number => value !== null);

    if (partHeights.length > 0) {
        return Math.max(...partHeights);
    }

    const rootHeight = parseHeight(rootProps as GeoJsonProperties);
    return rootHeight ?? 20;
}

/**
 * Merges computed `properties.compute` payloads into the base roads collection.
 *
 * The merge is index-based and bounded by the shortest collection length.
 * Existing non-compute properties are preserved.
 *
 * @param baseRoads Mutable roads collection used by map/chart thematic updates.
 * @param computedRoads Analytical output collection.
 */
export function mergeComputedRoads(baseRoads: FeatureCollection, computedRoads: FeatureCollection): void {
    const count = Math.min(baseRoads.features.length, computedRoads.features.length);

    for (let i = 0; i < count; i++) {
        const target = baseRoads.features[i];
        const source = computedRoads.features[i];

        const targetProps = (target.properties ?? {}) as Record<string, unknown>;
        const computeProps = source.properties?.compute;
        target.properties = {
            ...targetProps,
            ...(computeProps ? { compute: computeProps } : {}),
        };
    }
}

/**
 * Resets compute fields to zero for all roads.
 *
 * Useful for no-selection states while keeping compute/contribution thematic
 * accessors valid.
 *
 * @param baseRoads Mutable roads collection.
 */
export function clearRoadsCompute(baseRoads: FeatureCollection): void {
    for (const feature of baseRoads.features) {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        feature.properties = {
            ...props,
            compute: { shadow: 0, contribution: 0 },
        };
    }
}
