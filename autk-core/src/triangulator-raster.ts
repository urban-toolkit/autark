/**
 * Converts a GeoTIFF FeatureCollection (with bounding box) into a 2-triangle quad mesh.
 * UV coordinates map directly to the raster's normalized [0,1]² texture space for GPU sampling.
 * @module triangulator-raster
 */

import { FeatureCollection, Geometry } from 'geojson';

import { LayerGeometry, LayerComponent } from './types-mesh';

/**
 * Triangulator for raster data represented as GeoTIFF features. Generates a single quad mesh
 * covering the raster's bounding box, with UV coordinates for texture mapping. This allows
 * the raster to be rendered as a textured surface in 3D space, with the texture sampled
 * from the original GeoTIFF data.
 */
export class TriangulatorRaster {
    /**
     * Builds a single textured quad covering the raster bounding box.
     *
     * The raster is represented as one rectangle in local XY space, with UV
     * coordinates spanning the normalized texture domain used for GPU sampling.
     *
     * @param geotiff - Raster feature collection whose `bbox` defines the quad extent.
     * @param origin - World-space origin used to convert raster corners into local coordinates.
     * @returns A tuple containing the raster quad geometry and its component metadata.
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
