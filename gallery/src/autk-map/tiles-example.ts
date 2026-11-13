import { DEFAULT_WORKSPACE_COORDINATE_FORMAT } from '@urban-toolkit/autk-core';

import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';
import type { FrameStatsSnapshot, TileLayerStats, TileCrs } from '@urban-toolkit/autk-map';

const URL = (import.meta as any).env.BASE_URL;

const TILE_LAYER = 'imagery';
/** How often the statistics panel reads the layer. Reading never renders. */
const PANEL_INTERVAL_MS = 250;
/** Tilt of the Tilted view away from straight down, in radians (about 57 degrees). */
const TILT = 1.0;

/** Final status is resolved once before any panel DOM writes. */
export interface TilePanelStatus { text: string; state: 'loading' | 'error' | 'ready'; busy: boolean }

/** Shared controls for standalone tiles and the separate categorical-road overlay example. */
export class TilesBasemap {
    /** Coordinate format shared with the default database workspace. */
    static readonly coordinateFormat: TileCrs = DEFAULT_WORKSPACE_COORDINATE_FORMAT;
    protected map!: AutkMap;

    protected center = { latitude: 40.7831, longitude: -73.9712 };
    protected zoom = 11.5;
    protected showStatistics = true;
    protected showOpacity = true;
    private overview!: { target: number[]; eye: number[]; near: number; far: number };
    private panelTimer: ReturnType<typeof setInterval> | null = null;
    private readonly cleanups: Array<() => void> = [];

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();
        try {
            await this.loadLayers();
            this.changeSource((element('source-select') as HTMLSelectElement).value, true);
            await this.initializeView();
            this.overview = { target: [...this.map.camera.getLookAt()], eye: [...this.map.camera.getEye()],
                near: this.map.camera.getNear(), far: this.map.camera.getFar() };
            this.map.draw();
            this.bindControls();
            this.startPanel();
        } catch (error) { this.dispose(); throw error; }
    }

    /** Stops the panel timer, removes listeners and releases the map. */
    public dispose(): void {
        if (this.panelTimer !== null) clearInterval(this.panelTimer);
        this.panelTimer = null;
        for (const cleanup of this.cleanups.splice(0)) cleanup();
        this.map?.destroy();
    }

    /** Subclasses may load overlays before the tile source is created. */
    protected async loadLayers(): Promise<void> { return; }

    /** Optional terrain setup after the geographic tile view establishes an origin. */
    protected async initializeView(): Promise<void> { return; }

    private showOverview(): void {
        const { target, eye, near, far } = this.overview;
        this.map.camera.resetCamera([0, 1, 0], target, eye, far, near);
    }

    private showTilted(): void {
        const { target, eye, near, far } = this.overview;
        const distance = eye[2] - target[2];
        this.map.camera.resetCamera([0, Math.cos(TILT), Math.sin(TILT)], target,
            [target[0], target[1] - distance * Math.sin(TILT), target[2] + distance * Math.cos(TILT)], far, near);
    }

    private markLoading(): void {
        const status = element('map-status');
        status.textContent = 'Loading tiles…';
        status.dataset.state = 'loading';
    }

    private changeSource(key: string, initializeView = false): void {
        this.markLoading();
        this.map.removeLayer(TILE_LAYER);
        if (key !== 'local' && !Object.prototype.hasOwnProperty.call(TILE_SOURCES, key)) throw new Error(`Unknown tile source: ${key}`);
        const source = key === 'local'
            ? { urlTemplate: `${URL}data/tile-basemap.png?z={z}&x={x}&y={y}`, attribution: 'Autark synthetic test imagery', maxZoom: 19 }
            : TILE_SOURCES[key as keyof typeof TILE_SOURCES];
        if (!source) throw new Error(`Unknown tile source: ${key}`);
        this.map.loadTiles(TILE_LAYER, { source, crs: TilesBasemap.coordinateFormat, ...(initializeView ? { center: this.center, zoom: this.zoom } : {}), opacity: Number(document.querySelector<HTMLInputElement>('#opacity')?.value ?? 1) });
        if (!this.map.getTileStats(TILE_LAYER)) throw new Error('Unable to initialize the tile source');
        this.map.updateRenderInfo(TILE_LAYER, { isSkip: !(element('show-tiles') as HTMLInputElement).checked });
    }

    // ── Controls ─────────────────────────────────────────────────────────────

    private bindControls(): void {
        this.on('source-select', 'change', event => this.changeSource((event.target as HTMLSelectElement).value));
        this.on('view-overview', 'click', () => { this.showOverview(); this.markLoading(); });
        this.on('view-tilted', 'click', () => { this.showTilted(); this.markLoading(); });

        this.on('show-tiles', 'change', (event) => {
            const visible = (event.target as HTMLInputElement).checked;
            this.map.updateRenderInfo(TILE_LAYER, { isSkip: !visible });
        });

        if (this.showOpacity) {
            const output = element('opacity-value');
            this.on('opacity', 'input', (event) => {
                const opacity = Number((event.target as HTMLInputElement).value);
                output.textContent = `${Math.round(opacity * 100)}%`;
                this.map.updateRenderInfo(TILE_LAYER, { opacity });
            });
        }
    }

    private on(id: string, type: string, listener: (event: Event) => void): void {
        const target = element(id);
        target.addEventListener(type, listener);
        this.cleanups.push(() => target.removeEventListener(type, listener));
    }

    // ── Statistics panel ─────────────────────────────────────────────────────

    private startPanel(): void {
        this.updatePanel();
        this.panelTimer = setInterval(() => this.updatePanel(), PANEL_INTERVAL_MS);
        // Do not keep a timer running for a page that is gone.
        const stop = () => this.dispose();
        window.addEventListener('pagehide', stop);
        this.cleanups.push(() => window.removeEventListener('pagehide', stop));
    }

    protected updatePanel(tiles = this.map.getTileStats(TILE_LAYER), resolvedStatus?: TilePanelStatus): void {
        if (!tiles) return;
        const loading = tiles.visible && (!tiles.idle || tiles.zoom === null);
        const resolved = resolvedStatus ?? {
            text: !tiles.visible ? 'Tiles hidden' : loading ? 'Loading tiles…' : tiles.missingTiles > 0 ? 'Tiles unavailable' : 'Interactive map',
            state: loading ? 'loading' : tiles.visible && tiles.missingTiles > 0 ? 'error' : 'ready',
            busy: loading,
        };
        setText('map-status', resolved.text);
        const status = element('map-status');
        if (status.dataset.state !== resolved.state) status.dataset.state = resolved.state;
        const stage = document.querySelector('.map-stage');
        if (stage?.getAttribute('aria-busy') !== String(resolved.busy)) stage?.setAttribute('aria-busy', String(resolved.busy));
        if (!this.showStatistics) return;
        const frames = this.map.renderStats;
        setText('stats-status', describeStatus(tiles, frames));
        setText('stat-selection', tiles.zoom === null ? '-' : `z${tiles.zoom} / ${tiles.selectedTiles}`, describeSelection(tiles));
        setText('stat-drawn', `${tiles.readyTiles} / ${tiles.fallbackTiles} / ${tiles.missingTiles}`);
        setText('stat-requests-now', `${tiles.activeRequests} / ${tiles.queuedRequests} / ${tiles.waitingRetries}${tiles.waitingRetries > 0 ? ' (retrying)' : ''}`);
        setText('stat-cache', `${tiles.cachedTextures} / ${tiles.cacheLimit}`);
        setText('stat-memory', `${(tiles.textureBytes / (1024 * 1024)).toFixed(1)} MiB`);
        setText('stat-counters', `${tiles.requests} / ${tiles.cacheReuses} / ${tiles.evictions}`);
        setText('stat-frames', frames.frameCount === 0
            ? '-'
            : `${frames.lastFrameCpuMs.toFixed(1)} ms (avg ${frames.averageFrameCpuMs.toFixed(1)}) / ${frames.framesPerSecond > 0 ? frames.framesPerSecond.toFixed(0) : 'not rendering'}`);
        setText('stat-frame-count', String(frames.frameCount));
    }
}

/** Extra selection details for the compact zoom and tile-count tooltip. */
function describeSelection(tiles: TileLayerStats): string {
    if (tiles.zoom === null) return 'No zoom selected';
    const coarser = tiles.wantedZoom !== null && tiles.wantedZoom > tiles.zoom
        ? ` View requests zoom ${tiles.wantedZoom}; limited by the tile cap.` : '';
    return `Zoom ${tiles.zoom}; ${tiles.selectedTiles} selected tiles.${coarser}${tiles.truncated ? ' Tile count limited by the tile cap.' : ''}`;
}

/** One line for what the layer is doing. */
function describeStatus(tiles: TileLayerStats, frames: FrameStatsSnapshot): string {
    if (!tiles.visible) return 'Tiles hidden: no requests';
    if (tiles.waitingRetries > 0) return `Waiting to retry ${tiles.waitingRetries} tile${tiles.waitingRetries === 1 ? '' : 's'}`;
    if (!tiles.idle) return `Loading: ${tiles.activeRequests + tiles.queuedRequests} tile${tiles.activeRequests + tiles.queuedRequests === 1 ? '' : 's'} left`;
    return frames.framesPerSecond > 0 ? 'Idle (finishing a frame)' : 'Idle';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function element(id: string): HTMLElement {
    const found = document.getElementById(id);
    if (!found) throw new Error(`Missing element #${id}`);
    return found;
}

/** Writes text only when it changed, so an idle panel does no layout work. */
function setText(id: string, text: string, title?: string): void {
    const target = element(id);
    if (target.textContent !== text) target.textContent = text;
    if (title !== undefined && target.title !== title) target.title = title;
}
