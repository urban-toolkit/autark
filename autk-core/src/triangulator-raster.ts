/**
 * @module triangulator-raster
 * Triangulation helpers for raster feature collections.
 *
 * This module converts a GeoTIFF-backed `FeatureCollection` into a single quad
 * mesh that can be textured by the raster sampler. The quad is derived from the
 * collection bounding box, translated into the map's local coordinate space by
 * subtracting the shared origin, and assigned normalized UV coordinates for GPU
 * texture lookup.
 */

import { FeatureCollection, Geometry } from 'geojson';

import { LayerGeometry, LayerComponent } from './types-mesh';

/**
 * Builds textured mesh geometry for GeoTIFF raster layers.
 *
 * `TriangulatorRaster` turns the source collection `bbox` into a single quad in
 * local XY space. The four corners are shifted by the supplied origin so the
 * raster aligns with the rest of the layer stack, and the quad is emitted with
 * UVs spanning `[0, 1]` to match normalized texture coordinates.
 */
export class TriangulatorRaster {
    /**
     * Builds a single textured quad covering the raster bounding box.
     *
     * @param geotiff Raster feature collection whose `bbox` defines the quad extent.
     * @param origin World-space origin subtracted from each corner to form local coordinates.
     * @returns A tuple of quad geometry and matching component metadata.
     * @throws Never throws. When `bbox` is missing, returns empty arrays with a console warning.
     * @example
     * const [meshes, comps] = TriangulatorRaster.buildMesh(rasterFC, origin);
     */
    static buildMesh(geotiff: FeatureCollection<Geometry | null>, origin: number[]): [LayerGeometry[], LayerComponent[]] {
        const mesh: LayerGeometry[] = [];
        const comps: LayerComponent[] = [];

        const bbox = geotiff.bbox;

        if (!bbox) {
            console.warn('GeoTIFF feature collection does not have a bounding box.');
            return [mesh, comps];
        }

        const p0 = [bbox[0] - origin[0], bbox[1] - origin[1]];
        const p1 = [bbox[2] - origin[0], bbox[1] - origin[1]];
        const p2 = [bbox[2] - origin[0], bbox[3] - origin[1]];
        const p3 = [bbox[0] - origin[0], bbox[3] - origin[1]];

        const flatCoords = [p0[0], p0[1], p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]];
        const texCoords = [0, 0, 1, 0, 1, 1, 0, 1];
        const flatIds = [0, 1, 2, 0, 2, 3];

        mesh.push({ 
            position: new Float32Array(flatCoords), 
            texCoord: new Float32Array(texCoords), 
            indices: new Uint32Array(flatIds) 
        });

        comps.push({ nPoints: flatCoords.length / 2, nTriangles: flatIds.length / 3, featureIndex: 0 });

        return [mesh, comps];
    }
}
