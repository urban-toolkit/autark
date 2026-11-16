import { TERRAIN_TILE_SOURCES } from '@urban-toolkit/autk-map';
import type { TerrainTileSource } from '@urban-toolkit/autk-map';
import { TilesBasemap } from './tiles-example';

/** Add only elevation to the same imagery-only city view. */
export class TerrainTiles extends TilesBasemap {
    protected terrainSource: TerrainTileSource = TERRAIN_TILE_SOURCES.awsTerrarium;

    protected override async initializeView(): Promise<void> {
        this.map.loadTerrain({ source: this.terrainSource });
    }

    protected override updatePanel(): void {
        const terrain = this.map.getTerrainTileStats(), imagery = this.map.getTileStats('imagery');
        if (!terrain || !imagery) return;
        const busy = !terrain.idle || (imagery.visible && !imagery.idle);
        const partial = terrain.idle && !terrain.complete;
        const unavailable = imagery.visible && imagery.idle && imagery.missingTiles > 0;
        super.updatePanel(imagery, { text: partial ? 'Some elevation is unavailable' : unavailable ? 'Some imagery is unavailable'
            : busy ? 'Loading imagery and terrain…' : imagery.visible ? 'Interactive map' : 'Imagery hidden',
            state: partial || unavailable ? 'error' : busy ? 'loading' : 'ready', busy });
    }
}
