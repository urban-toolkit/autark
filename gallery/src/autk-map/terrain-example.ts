import { TERRAIN_TILE_SOURCES } from '@urban-toolkit/autk-map';
import type { TerrainTileSource } from '@urban-toolkit/autk-map';
import { TilesBasemap } from './tiles-example';

/** The tile-only example extended with streamed terrain beneath Rio imagery. */
export class TerrainTiles extends TilesBasemap {
    protected override center = { latitude: -22.96, longitude: -43.2075 };
    protected override zoom = 14;
    protected terrainSource: TerrainTileSource = TERRAIN_TILE_SOURCES.awsTerrarium;

    protected override async initializeView(): Promise<void> {
        this.map.loadTerrain({ source: this.terrainSource });
    }

    protected override updatePanel(): void {
        const terrain = this.map.getTerrainTileStats(), imagery = this.map.getTileStats('imagery');
        if (!terrain || !imagery) return;
        const busy = !terrain.idle || (imagery.visible && (!imagery.idle || imagery.zoom === null));
        const partial = terrain.idle && !terrain.complete;
        const unavailable = imagery.visible && imagery.idle && imagery.missingTiles > 0;
        super.updatePanel(imagery, {
            text: partial ? 'Partial terrain coverage' : unavailable ? 'Tiles unavailable' : busy ? 'Loading terrain and imagery…' : imagery.visible ? 'Interactive map' : 'Imagery hidden',
            state: partial || unavailable ? 'error' : busy ? 'loading' : 'ready',
            busy,
        });
        const values = {
            'terrain-tiles': `${terrain.readyTiles} / ${terrain.wantedTiles}`,
            'terrain-memory': `${(terrain.memory.total / 1048576).toFixed(1)} MiB`,
            'terrain-compose': `${terrain.timing.compose.p95.toFixed(1)} ms`,
        };
        for (const [id, value] of Object.entries(values)) {
            const element = document.getElementById(id);
            if (element && element.textContent !== value) element.textContent = value;
        }
    }
}
