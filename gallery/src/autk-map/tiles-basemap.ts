import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';

import { AutkDb } from '@urban-toolkit/autk-db';
import { AutkMap, TILE_SOURCES } from '@urban-toolkit/autk-map';
import type { FrameStatsSnapshot, TileLayerStats } from '@urban-toolkit/autk-map';

const URL = (import.meta as any).env.BASE_URL;

const TILE_LAYER = 'imagery';
const BOUNDARY_LAYER = 'boundaries';
/** The area the Neighborhood and Tilted views look at. */
const NEIGHBORHOOD = 'Midtown-Times Square';
/** How often the statistics panel reads the layer. Reading never renders. */
const PANEL_INTERVAL_MS = 250;
/** Tilt of the Tilted view away from straight down, in radians (about 57 degrees). */
const TILT = 1.0;

/** Boundary width in map metres, which is not screen pixels: thin enough to stay faint at each distance. */
const BOUNDARY_WIDTH = { overview: 40, close: 6 };

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

/**
 * Satellite basemap explorer.
 *
 * One tile source (Esri World Imagery) under faint neighborhood boundaries, with
 * three repeatable views of the same area, a visibility switch, an opacity
 * slider and a live panel that reads the layer's statistics. The panel polls on
 * a timer and only reads, so an idle map stays idle.
 */
export class TilesBasemap {
    protected map!: AutkMap;
    protected db!: AutkDb;

    private areaBounds!: Bounds;
    private cityBounds!: Bounds;
    private panelTimer: ReturnType<typeof setInterval> | null = null;
    private readonly cleanups: Array<() => void> = [];

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkDb();
        await this.db.init();

        await this.db.loadGeojson({
            geojsonFileUrl: `${URL}data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
        });

        this.map = new AutkMap(canvas);
        await this.map.init();

        // Faint boundaries instead of filled polygons, so the imagery stays visible.
        const neighborhoods = await this.db.getLayer('neighborhoods');
        this.cityBounds = boundsOf(neighborhoods.features);
        const area = neighborhoods.features.filter((f) => f.properties?.ntaname === NEIGHBORHOOD);
        this.areaBounds = area.length > 0 ? boundsOf(area) : this.cityBounds;

        this.map.loadCollection(BOUNDARY_LAYER, { collection: boundaryLines(neighborhoods), type: 'polylines' });
        this.map.updateRenderInfo(BOUNDARY_LAYER, {
            color: { r: 255, g: 255, b: 255, alpha: 1 },
            opacity: 0.55,
            polylinesWidth: BOUNDARY_WIDTH.close,
        });

        // The workspace uses EPSG:3395, the default of `loadTiles`.
        this.map.loadTiles(TILE_LAYER, { source: TILE_SOURCES.esriWorldImagery });

        this.showNeighborhood();
        this.map.draw();
        this.bindControls();
        this.startPanel();
    }

    /** Stops the panel timer, removes listeners and releases the map. */
    public dispose(): void {
        if (this.panelTimer !== null) clearInterval(this.panelTimer);
        this.panelTimer = null;
        for (const cleanup of this.cleanups.splice(0)) cleanup();
        this.map?.destroy();
    }

    // ── Views ────────────────────────────────────────────────────────────────

    private showOverview(): void {
        this.look(this.cityBounds, 0, 1.08);
        this.map.updateRenderInfo(BOUNDARY_LAYER, { polylinesWidth: BOUNDARY_WIDTH.overview });
    }

    private showNeighborhood(): void {
        this.look(this.areaBounds, 0, 1.3);
        this.map.updateRenderInfo(BOUNDARY_LAYER, { polylinesWidth: BOUNDARY_WIDTH.close });
    }

    private showTilted(): void {
        this.look(this.areaBounds, TILT, 1.6);
        this.map.updateRenderInfo(BOUNDARY_LAYER, { polylinesWidth: BOUNDARY_WIDTH.close });
    }

    /** Points the camera at the centre of an area, from straight above or tilted towards the south. */
    private look(area: Bounds, tilt: number, margin: number): void {
        const origin = this.map.layerManager.origin;
        const center = [(area.minX + area.maxX) / 2 - origin[0], (area.minY + area.maxY) / 2 - origin[1], 0];
        const aspect = this.map.canvas.clientWidth / this.map.canvas.clientHeight;
        const extent = Math.max(area.maxY - area.minY, (area.maxX - area.minX) / aspect);
        const distance = (extent * margin) / (2 * Math.tan(this.map.camera.getFovyRadians() / 2));
        const eye = [center[0]!, center[1]! - distance * Math.sin(tilt), distance * Math.cos(tilt)];
        this.map.camera.resetCamera([0, Math.cos(tilt), Math.sin(tilt)], center, eye);
    }

    // ── Controls ─────────────────────────────────────────────────────────────

    private bindControls(): void {
        this.on('view-overview', 'click', () => this.showOverview());
        this.on('view-neighborhood', 'click', () => this.showNeighborhood());
        this.on('view-tilted', 'click', () => this.showTilted());

        this.on('show-tiles', 'change', (event) => {
            const visible = (event.target as HTMLInputElement).checked;
            this.map.updateRenderInfo(TILE_LAYER, { isSkip: !visible });
        });

        const output = element('opacity-value');
        this.on('opacity', 'input', (event) => {
            const opacity = Number((event.target as HTMLInputElement).value);
            output.textContent = `${Math.round(opacity * 100)}%`;
            this.map.updateRenderInfo(TILE_LAYER, { opacity });
        });
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

    private updatePanel(): void {
        const tiles = this.map.getTileStats(TILE_LAYER);
        if (!tiles) return;
        const frames = this.map.renderStats;

        setText('stats-status', describeStatus(tiles, frames));
        setText('stat-selection', describeSelection(tiles));
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

/** Zoom and tile count, saying when the tile cap holds the zoom below what the view asked for. */
function describeSelection(tiles: TileLayerStats): string {
    if (tiles.zoom === null) return '-';
    const coarser = tiles.wantedZoom !== null && tiles.wantedZoom > tiles.zoom ? ` (view wants z${tiles.wantedZoom}: tile cap)` : '';
    return `z${tiles.zoom}${coarser} / ${tiles.selectedTiles}${tiles.truncated ? ' (cut to the tile cap)' : ''}`;
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
function setText(id: string, text: string): void {
    const target = element(id);
    if (target.textContent !== text) target.textContent = text;
}

/** Rings of a Polygon or MultiPolygon. */
function ringsOf(geometry: Geometry): Position[][] {
    if (geometry.type === 'Polygon') return geometry.coordinates;
    if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
    return [];
}

function boundsOf(features: Array<Feature<Geometry>>): Bounds {
    const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const feature of features) {
        for (const ring of ringsOf(feature.geometry)) {
            for (const [x, y] of ring) {
                bounds.minX = Math.min(bounds.minX, x as number);
                bounds.maxX = Math.max(bounds.maxX, x as number);
                bounds.minY = Math.min(bounds.minY, y as number);
                bounds.maxY = Math.max(bounds.maxY, y as number);
            }
        }
    }
    return bounds;
}

/** The outlines of polygon features as lines, so they can be drawn without a fill. */
function boundaryLines(collection: FeatureCollection<Geometry>): FeatureCollection<Geometry> {
    return {
        type: 'FeatureCollection',
        features: collection.features.map((feature) => ({
            type: 'Feature',
            properties: { name: feature.properties?.ntaname },
            geometry: { type: 'MultiLineString', coordinates: ringsOf(feature.geometry) },
        })),
    };
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new TilesBasemap();
    await example.run(canvas);
}
main();
