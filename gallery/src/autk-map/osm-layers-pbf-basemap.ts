import { TILE_SOURCES, TERRAIN_TILE_SOURCES } from '@urban-toolkit/autk-map';
import { runExample } from '../example';
import { OsmLayersApi } from './osm-layers-pbf-example';

export interface PbfBasemapOptions { imagery?: boolean; terrain?: boolean }

/** Loads the original PBF vector stack before adding optional imagery and elevation. */
export class OsmLayersPbfBasemap extends OsmLayersApi {
    private timer: ReturnType<typeof setInterval> | undefined;
    private readonly onPageHide = () => this.dispose();

    constructor(private readonly options: PbfBasemapOptions) { super(); }

    override async run(canvas: HTMLCanvasElement): Promise<void> {
        try {
            await super.run(canvas);
            this.refreshStatus();
            this.timer = setInterval(() => this.refreshStatus(), 250);
            window.addEventListener('pagehide', this.onPageHide, { once: true });
        } catch (error) { this.dispose(); throw error; }
    }

    protected override async loadLayers(): Promise<void> {
        await super.loadLayers();
        this.map.fitBounds();
        if (this.options.imagery) {
            this.map.loadTiles('imagery', { source: TILE_SOURCES.osmLight });
            // Keep the loaded surface available in the layer menu while revealing the imagery below it.
            this.map.updateRenderInfo('table_osm_surface', { isSkip: true });
        }
        if (this.options.terrain) this.map.loadTerrain({ source: {
            ...TERRAIN_TILE_SOURCES.awsTerrarium,
            attribution: [...TERRAIN_TILE_SOURCES.awsTerrarium.attribution,
                { text: '© OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }],
        } });
    }

    refreshStatus(): void {
        const tiles = this.options.imagery ? this.map.getTileStats('imagery') : null;
        const terrain = this.options.terrain ? this.map.getTerrainTileStats() : null;
        const busy = !!terrain && !terrain.idle || !!tiles && tiles.visible && (!tiles.idle || tiles.zoom === null);
        const partial = !!terrain && terrain.idle && !terrain.complete;
        const unavailable = !!tiles && tiles.visible && tiles.idle && tiles.missingTiles > 0;
        const text = partial ? 'Partial terrain coverage' : unavailable ? 'Imagery unavailable' : busy ? 'Loading map tiles…' : 'Interactive map';
        const state = partial || unavailable ? 'error' : busy ? 'loading' : 'ready';
        const status = document.querySelector<HTMLElement>('#map-status');
        if (status && status.textContent !== text) status.textContent = text;
        if (status && status.dataset.state !== state) status.dataset.state = state;
        const stage = document.querySelector('.map-stage');
        if (stage?.getAttribute('aria-busy') !== String(busy)) stage?.setAttribute('aria-busy', String(busy));
    }

    dispose(): void {
        clearInterval(this.timer);
        this.timer = undefined;
        window.removeEventListener('pagehide', this.onPageHide);
        this.map?.destroy();
    }
}

/** Starts one variant while preserving the tile-loading status after database initialization. */
export function startPbfBasemap(options: PbfBasemapOptions): void {
    const example = new OsmLayersPbfBasemap(options);
    let initialized = false;
    void runExample(async () => {
        const canvas = document.querySelector('canvas');
        if (!canvas) throw new Error('No canvas found');
        await example.run(canvas);
        initialized = true;
    }, true).then(() => { if (initialized) example.refreshStatus(); });
}
