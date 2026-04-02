/// <reference types="@webgpu/types" />

import {
    Feature,
    FeatureCollection,
    GeometryCollection,
    LineString,
    MultiLineString,
    MultiPolygon,
    Polygon,
    GeoJsonProperties,
    Geometry,
} from 'geojson';

const FLOOR_HEIGHT = 3.4;
const DEFAULT_FLOORS = 2;

function getHeightsFromProps(p: GeoJsonProperties): [number, number] {
    const props = p ?? {};
    let maxH: number;
    if (props['height'] != null)                maxH = +props['height'];
    else if (props['levels'] != null)            maxH = FLOOR_HEIGHT * +props['levels'];
    else if (props['building:levels'] != null)   maxH = FLOOR_HEIGHT * +props['building:levels'];
    else                                         maxH = FLOOR_HEIGHT * DEFAULT_FLOORS;

    let minH = 0;
    if (props['min_height'] != null)             minH = +props['min_height'];
    else if (props['min_level'] != null)         minH = FLOOR_HEIGHT * +props['min_level'];
    else if (props['building:min_level'] != null) minH = FLOOR_HEIGHT * +props['building:min_level'];

    return [Math.max(0, minH), Math.max(minH + 0.1, maxH)];
}

function getBuildingHeights(feature: Feature): [number, number] {
    return getHeightsFromProps(feature.properties);
}

function extrudeRing(
    ring: number[][],
    ox: number, oy: number,
    minH: number, maxH: number,
    positions: number[],
    indices: number[],
): void {
    const n = ring.length;

    // Walls: each edge → two triangles
    for (let i = 0; i < n - 1; i++) {
        const x0 = ring[i][0] - ox,     y0 = ring[i][1] - oy;
        const x1 = ring[i + 1][0] - ox, y1 = ring[i + 1][1] - oy;
        const base = positions.length / 3;
        positions.push(x0, y0, minH,  x1, y1, minH,  x1, y1, maxH,  x0, y0, maxH);
        indices.push(base, base + 1, base + 2,  base, base + 2, base + 3);
    }

    // Roof: fan triangulation from first vertex (correct for convex rings)
    const verts = ring.slice(0, -1); // exclude closing vertex
    if (verts.length < 3) return;
    const roofBase = positions.length / 3;
    for (const p of verts) positions.push(p[0] - ox, p[1] - oy, maxH);
    for (let i = 1; i < verts.length - 1; i++) {
        indices.push(roofBase, roofBase + i, roofBase + i + 1);
    }
}

function processGeometry(
    geom: Geometry,
    ox: number, oy: number,
    minH: number, maxH: number,
    positions: number[],
    indices: number[],
): void {
    if (geom.type === 'Polygon') {
        for (const ring of (geom as Polygon).coordinates)
            extrudeRing(ring as number[][], ox, oy, minH, maxH, positions, indices);

    } else if (geom.type === 'MultiPolygon') {
        for (const poly of (geom as MultiPolygon).coordinates)
            for (const ring of poly)
                extrudeRing(ring as number[][], ox, oy, minH, maxH, positions, indices);

    } else if (geom.type === 'LineString') {
        extrudeRing((geom as LineString).coordinates as number[][], ox, oy, minH, maxH, positions, indices);

    } else if (geom.type === 'MultiLineString') {
        for (const line of (geom as MultiLineString).coordinates)
            extrudeRing(line as number[][], ox, oy, minH, maxH, positions, indices);
    }
}

function processFeature(
    feature: Feature,
    ox: number, oy: number,
    positions: number[],
    indices: number[],
): void {
    const geom = feature.geometry;
    if (!geom) return;

    // New format: one feature per building with GeometryCollection geometry
    // and per-part heights stored in properties.parts[i].
    if (geom.type === 'GeometryCollection') {
        const geometries = (geom as GeometryCollection).geometries;
        const parts = (feature.properties?.parts ?? []) as GeoJsonProperties[];
        for (let i = 0; i < geometries.length; i++) {
            const [minH, maxH] = getHeightsFromProps(parts[i] ?? {});
            processGeometry(geometries[i], ox, oy, minH, maxH, positions, indices);
        }
        return;
    }

    // Legacy format: individual part features with heights in top-level properties.
    const [minH, maxH] = getBuildingHeights(feature);
    processGeometry(geom, ox, oy, minH, maxH, positions, indices);
}

function expandGeometry(geom: Geometry, expand: (c: number[]) => void): void {
    if (geom.type === 'Point') {
        expand((geom as any).coordinates);
    } else if (geom.type === 'LineString') {
        for (const c of (geom as LineString).coordinates) expand(c);
    } else if (geom.type === 'MultiLineString') {
        for (const line of (geom as MultiLineString).coordinates) for (const c of line) expand(c);
    } else if (geom.type === 'Polygon') {
        for (const ring of (geom as Polygon).coordinates) for (const c of ring) expand(c);
    } else if (geom.type === 'MultiPolygon') {
        for (const poly of (geom as MultiPolygon).coordinates)
            for (const ring of poly) for (const c of ring) expand(c);
    } else if (geom.type === 'GeometryCollection') {
        for (const sub of (geom as GeometryCollection).geometries) expandGeometry(sub, expand);
    }
}

export function triangulateBuildings(
    geojson: FeatureCollection,
    origin: [number, number],
): { positions: Float32Array; indices: Uint32Array } {
    const positions: number[] = [];
    const indices: number[] = [];
    const [ox, oy] = origin;

    for (const feature of geojson.features)
        processFeature(feature, ox, oy, positions, indices);

    return {
        positions: new Float32Array(positions),
        indices: new Uint32Array(indices),
    };
}

export function computeOrigin(geojson: FeatureCollection): [number, number] {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    function expand(coord: number[]): void {
        if (coord[0] < minX) minX = coord[0];
        if (coord[0] > maxX) maxX = coord[0];
        if (coord[1] < minY) minY = coord[1];
        if (coord[1] > maxY) maxY = coord[1];
    }

    for (const feature of geojson.features) {
        const geom = feature.geometry;
        if (!geom) continue;
        expandGeometry(geom, expand);
    }

    return [(minX + maxX) * 0.5, (minY + maxY) * 0.5];
}
