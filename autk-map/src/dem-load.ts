/**
 * @module dem-load
 * Fetching and decoding one elevation tile.
 */

import { DEM_BITMAP_OPTIONS, decodeDemPixels } from './dem-decode';
import type { DemEncoding, DemTile } from './dem-decode';
import { TileLoadError, fetchTileImage } from './tile-loader';

/**
 * Fetches an elevation tile and decodes its heights.
 *
 * Needs a server that allows cross-origin requests. The image is read without
 * color conversion or premultiplied alpha, drawn to a canvas, and its bytes
 * decoded on the CPU.
 *
 * @param url - Tile URL.
 * @param signal - Aborts the request.
 * @param encoding - How heights are packed.
 * @param tileSize - Expected pixels per edge; a tile of another size is rejected.
 * @returns The decoded tile.
 * @throws {TileLoadError} For a failed request, an undecodable image, or an image of the wrong size (permanent).
 * @example
 * const tile = await fetchDemTile(url, controller.signal, 'terrarium', 256);
 */
export async function fetchDemTile(
    url: string,
    signal: AbortSignal,
    encoding: DemEncoding,
    tileSize: number,
): Promise<DemTile> {
    const bitmap = await fetchTileImage(url, signal, DEM_BITMAP_OPTIONS);
    try {
        if (bitmap.width !== tileSize || bitmap.height !== tileSize) {
            throw new TileLoadError(
                `Elevation tile is ${bitmap.width} x ${bitmap.height}, expected ${tileSize} x ${tileSize}: ${url}`,
                { permanent: true },
            );
        }
        const canvas = new OffscreenCanvas(tileSize, tileSize);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) {
            throw new TileLoadError('Could not read elevation tile pixels: no 2D canvas context.', { permanent: true });
        }
        context.drawImage(bitmap, 0, 0);
        return decodeDemPixels(context.getImageData(0, 0, tileSize, tileSize).data, tileSize, encoding);
    } finally {
        bitmap.close();
    }
}
