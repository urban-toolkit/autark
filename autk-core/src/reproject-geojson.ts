/** Non-mutating vector GeoJSON reprojection using the shared Proj4js registry. */
import { coordEach } from '@turf/turf';
import type { BBox, Feature, FeatureCollection, Geometry, Position } from 'geojson';
import { createCoordinateTransform } from './crs';

/** Recomputes bounds from transformed vertices; corner-only conversion fails for nonlinear projections. */
function updateBounds(geojson: FeatureCollection<Geometry | null> | Feature<Geometry | null> | Geometry): void {
    if (!geojson.bbox) return;
    const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
    // Turf handles null geometries at runtime, although its AllGeoJSON type excludes them.
    coordEach(geojson as FeatureCollection | Feature | Geometry, coordinate => {
        for (let dimension = 0; dimension < 3; dimension++) {
            const value = coordinate[dimension];
            if (Number.isFinite(value)) {
                minimum[dimension] = Math.min(minimum[dimension], value);
                maximum[dimension] = Math.max(maximum[dimension], value);
            }
        }
    });
    if (!Number.isFinite(minimum[0])) { delete geojson.bbox; return; }
    const dimensions = geojson.bbox.length === 6 && Number.isFinite(minimum[2]) ? 3 : 2;
    geojson.bbox = [...minimum.slice(0, dimensions), ...maximum.slice(0, dimensions)] as BBox;
}

function reprojectGeometry(geometry: Geometry, transform: (position: Position) => Position): Geometry {
    const projected = geometry.type === 'GeometryCollection'
        ? { ...geometry, geometries: geometry.geometries.map(child => reprojectGeometry(child, transform)) }
        : structuredClone(geometry);
    if (projected.type !== 'GeometryCollection') coordEach(projected, coordinate => {
        const [x, y] = transform(coordinate);
        coordinate[0] = x;
        coordinate[1] = y;
    });
    updateBounds(projected);
    return projected;
}

/**
 * Reprojects vector geometry and recomputes declared bounds without mutating the input.
 * Names must be known to Proj4js (or registered with registerCrs); PROJ and WKT strings also work.
 * EPSG:4326 uses [longitude, latitude]. Properties, IDs, and Z values are preserved.
 * Identical CRSs return the input. Raster band arrays are not resampled.
 */
export function reprojectFeatureCollection(
    collection: FeatureCollection<Geometry | null>, sourceCrs: string, targetCrs: string,
): FeatureCollection<Geometry | null> {
    const transform = createCoordinateTransform(sourceCrs, targetCrs);
    if (sourceCrs === targetCrs) return collection;
    const projected: FeatureCollection<Geometry | null> = { ...collection,
        features: collection.features.map(feature => {
            const result = { ...feature, geometry: feature.geometry ? reprojectGeometry(feature.geometry, transform) : null };
            updateBounds(result);
            return result;
        }),
    };
    updateBounds(projected);
    // A legacy declaration would otherwise describe the original coordinates.
    delete (projected as FeatureCollection & { crs?: unknown }).crs;
    return projected;
}
