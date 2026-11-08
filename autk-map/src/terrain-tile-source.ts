/**
 * @module terrain-tile-source
 * Elevation tile sources: a {@link TileSource} plus how heights are encoded.
 */

import { isDemEncoding } from './dem-decode';
import type { DemEncoding } from './dem-decode';
import { resolveTileSource } from './tile-source';
import type { ResolvedTileSource, TileSource } from './tile-source';

/** An elevation tile source as written by an application. */
export interface TerrainTileSource extends TileSource {
    /** How heights are packed into the tile colors. */
    encoding: DemEncoding;
}

/** A {@link TerrainTileSource} with defaults applied and validated. */
export interface ResolvedTerrainTileSource extends ResolvedTileSource {
    readonly encoding: DemEncoding;
}

/**
 * Applies defaults to an elevation source and checks it.
 *
 * @param source - Source as written by the application.
 * @returns The resolved source.
 * @throws If `encoding` is not supported, or the tile source is invalid (see `resolveTileSource`).
 * @example
 * const resolved = resolveTerrainTileSource(TERRAIN_TILE_SOURCES.awsTerrarium);
 */
export function resolveTerrainTileSource(source: TerrainTileSource): ResolvedTerrainTileSource {
    if (!isDemEncoding(source.encoding)) {
        throw new Error(`Terrain tile source needs an encoding of 'terrarium' or 'mapbox', got ${String(source.encoding)}.`);
    }
    return { ...resolveTileSource(source), encoding: source.encoding };
}

/**
 * Ready-made elevation tile sources.
 *
 * These are conveniences, not licences. Each provider sets its own terms and the
 * attribution must stay visible; check the wording against the provider's
 * current terms. A Mapbox terrain-RGB source needs your own access token in the
 * URL, so it is not bundled: write it as `{ urlTemplate: '…/{z}/{x}/{y}.pngraw?access_token=…',
 * encoding: 'mapbox', tileSize: 256, attribution: … }`.
 */
export const TERRAIN_TILE_SOURCES = {
    /**
     * Terrarium tiles of the public "Terrain Tiles on AWS" dataset (Mapzen), zooms 0 to 15.
     *
     * Zoom 15 is the finest the provider documents for ground resolution (zoom 16 returns 404 on
     * the Terrarium path). The provider asks for "Mapzen" plus a statement for each data source
     * used where you are. The preset shows "Mapzen" and a link to the provider's list of sources
     * and their credits; it cannot know your area, so add the statements that apply there, for
     * example `attribution: [...TERRAIN_TILE_SOURCES.awsTerrarium.attribution, '3DEP data courtesy of the U.S. Geological Survey']`.
     * The provider says these S3 endpoints are meant for efficient networking with EC2 and are not
     * cached by CloudFront, and states no rate limits: put your own CDN in front for production.
     */
    awsTerrarium: {
        urlTemplate: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
        encoding: 'terrarium',
        attribution: [
            { text: 'Terrain: Mapzen', url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md' },
            { text: 'Elevation data sources and licenses', url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md' },
        ],
        minZoom: 0,
        maxZoom: 15,
        tileSize: 256,
    },
} as const satisfies Record<string, TerrainTileSource>;
