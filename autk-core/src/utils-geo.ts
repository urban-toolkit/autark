import { FeatureCollection } from 'geojson';

/**
 * Computes the central origin of a GeoJSON FeatureCollection.
 */
export function computeOrigin(geojson: FeatureCollection): [number, number] {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    const expand = (coord: number[]) => {
        if (coord[0] < minX) minX = coord[0];
        if (coord[0] > maxX) maxX = coord[0];
        if (coord[1] < minY) minY = coord[1];
        if (coord[1] > maxY) maxY = coord[1];
    };

    for (const feature of geojson.features) {
        const geom = feature.geometry;
        if (!geom) continue;
        expandGeometry(geom, expand);
    }

    if (!Number.isFinite(minX)) return [0, 0];
    return [(minX + maxX) * 0.5, (minY + maxY) * 0.5];
}

function expandGeometry(geom: any, expand: (c: number[]) => void): void {
    if (geom.type === 'Point') {
        expand(geom.coordinates);
    } else if (geom.type === 'LineString') {
        for (const c of geom.coordinates) expand(c);
    } else if (geom.type === 'MultiLineString') {
        for (const line of geom.coordinates) for (const c of line) expand(c);
    } else if (geom.type === 'Polygon') {
        for (const ring of geom.coordinates) for (const c of ring) expand(c);
    } else if (geom.type === 'MultiPolygon') {
        for (const poly of geom.coordinates)
            for (const ring of poly) for (const c of ring) expand(c);
    } else if (geom.type === 'GeometryCollection') {
        for (const sub of geom.geometries) expandGeometry(sub, expand);
    }
}
