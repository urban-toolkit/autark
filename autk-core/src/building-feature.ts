import type { Feature, Geometry, GeometryCollection } from 'geojson';

/** Attributes of one building part; coordinates exist only in the feature geometry. */
export interface BuildingPartProperties {
    geometryIndex: number;
    [key: string]: unknown;
}

/**
 * Normalizes one building to its original component geometries and explicit part indices.
 * Does not union, repair, clone coordinates, or group independent features.
 * Legacy positional `parts` metadata is accepted, but cannot be mixed with indexed metadata.
 *
 * @param feature A building feature with polygonal or ring geometry.
 * @returns A new feature/properties object; component geometries retain their original references.
 * @throws If geometry, metadata or component indices are unsupported or ambiguous.
 */
export function normalizeBuildingFeature(feature: Feature<Geometry | null>): Feature<GeometryCollection> {
    const geometry = feature.geometry;
    const context = `Building ${String(feature.id ?? '(without id)')}`;
    if (!geometry) throw new Error(`${context}: missing geometry`);
    const geometries = geometry.type === 'GeometryCollection' ? geometry.geometries : [geometry];
    for (const part of geometries) {
        if (part.type === 'GeometryCollection') throw new Error(`${context}: nested GeometryCollection is not supported`);
        if (!['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString'].includes(part.type)) {
            throw new Error(`${context}: unsupported part geometry ${part.type}`);
        }
    }

    const metadata = feature.properties?.parts ?? [];
    if (!Array.isArray(metadata)) throw new Error(`${context}: parts must be an array`);
    const indexed = metadata.some(part => part && typeof part === 'object' && 'geometryIndex' in part);
    const seen = new Set<number>();
    const parts: BuildingPartProperties[] = metadata.map((part, i) => {
        if (!part || typeof part !== 'object' || Array.isArray(part)) {
            throw new Error(`${context}: invalid part metadata at index ${i}`);
        }
        const index = indexed ? part.geometryIndex : i;
        if (!Number.isInteger(index) || index < 0 || index >= geometries.length || seen.has(index)) {
            throw new Error(`${context}: invalid or duplicate geometryIndex ${String(index)}`);
        }
        seen.add(index);
        return { ...part, geometryIndex: index };
    });

    return {
        ...feature,
        geometry: { type: 'GeometryCollection', geometries },
        properties: { ...feature.properties, parts },
    };
}

/**
 * Resolves original building components and their effective rendering attributes.
 * Parts inherit common attributes; alternative height/level tags override as a group.
 * Coordinates remain referenced, not copied. All renderers use the same association.
 */
export function getBuildingParts(feature: Feature<Geometry | null>): Array<{
    geometry: Geometry;
    geometryIndex: number;
    properties: Record<string, unknown>;
}> {
    const normalized = normalizeBuildingFeature(feature);
    const { parts, ...buildingProps } = normalized.properties!;
    const byIndex = new Map<number, BuildingPartProperties>(parts.map((part: BuildingPartProperties) => [part.geometryIndex, part]));
    return normalized.geometry.geometries.map((geometry, geometryIndex) => {
        const attributes = byIndex.get(geometryIndex) ?? {};
        const properties: Record<string, unknown> = { ...buildingProps, ...attributes };
        for (const keys of [
            ['height', 'building:height', 'levels', 'building:levels'],
            ['min_height', 'min_level', 'building:min_level'],
        ]) {
            if (keys.some(key => Object.prototype.hasOwnProperty.call(attributes, key))) {
                for (const key of keys) {
                    if (!Object.prototype.hasOwnProperty.call(attributes, key)) delete properties[key];
                }
            }
        }
        return { geometry, geometryIndex, properties };
    });
}
