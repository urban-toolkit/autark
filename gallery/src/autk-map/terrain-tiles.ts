import type { FeatureCollection } from 'geojson';

import { AutkMap, TERRAIN_TILE_SOURCES, TILE_SOURCES } from '@urban-toolkit/autk-map';
import type { TerrainTileStats, TimingSummary } from '@urban-toolkit/autk-map';

const TILE_LAYER = 'imagery';
const OUTLINE_LAYER = 'outline';
/** How often the statistics panel reads the map. Reading never renders. */
const PANEL_INTERVAL_MS = 250;
/** Tilt of the Tilted view away from straight down, in radians (about 57 degrees). */
const TILT = 1.0;

/** A place to look at: where, and how much ground each kind of view covers. */
interface Place {
    id: string;
    label: string;
    /** What makes it interesting, shown above the map. */
    note: string;
    centerLonLat: [number, number];
    /** Ground covered by the shorter screen side of the Top and Tilted views, in map metres. */
    close: number;
    /** The same for the Wide view. */
    wide: number;
}

/**
 * Places with a lot of relief. Heights come from the provider's data for the area (30 m global
 * data in most of them, 10 m in the United States), so detail varies. Map units are stretched by
 * 1/cos(latitude) against ground metres, so use a larger height scale at higher latitudes.
 */
const PLACES: readonly Place[] = [
    { id: 'rio', label: 'Rio', note: 'Rio de Janeiro: Corcovado and the coast, sea level to about 700 m', centerLonLat: [-43.2105, -22.9519], close: 6000, wide: 40000 },
    { id: 'hongkong', label: 'Hong Kong', note: 'Hong Kong: Victoria Peak (552 m) above the harbour', centerLonLat: [114.158, 22.278], close: 6000, wide: 40000 },
    { id: 'fuji', label: 'Mount Fuji', note: 'Mount Fuji: an isolated 3,776 m cone', centerLonLat: [138.7274, 35.3606], close: 25000, wide: 90000 },
    { id: 'zermatt', label: 'Zermatt', note: 'Zermatt and the Matterhorn: about 4 km of relief within 10 km', centerLonLat: [7.7, 45.99], close: 12000, wide: 60000 },
    { id: 'grandcanyon', label: 'Grand Canyon', note: 'Grand Canyon: cliffs 1.5 km deep, on 10 m data', centerLonLat: [-112.12, 36.08], close: 15000, wide: 60000 },
    { id: 'sanfrancisco', label: 'San Francisco', note: 'San Francisco: hills and bay, on 10 m data', centerLonLat: [-122.43, 37.76], close: 8000, wide: 40000 },
];

type View = 'top' | 'tilted' | 'wide';

/** EPSG:3395 (ellipsoidal Mercator), the workspace default of `AutkDb` and of the map. */
function worldMercator([lon, lat]: [number, number]): [number, number] {
    const radius = 6378137;
    const eccentricity = 0.0818191908426215;
    const phi = (lat * Math.PI) / 180;
    const sin = Math.sin(phi);
    const y = radius * Math.log(Math.tan(Math.PI / 4 + phi / 2) * Math.pow((1 - eccentricity * sin) / (1 + eccentricity * sin), eccentricity / 2));
    return [(radius * lon * Math.PI) / 180, y];
}

/** A square outline, as one closed line, around a point. */
function outline(center: [number, number], halfSide: number): FeatureCollection {
    const [x, y] = worldMercator(center);
    const ring = [
        [x - halfSide, y - halfSide],
        [x + halfSide, y - halfSide],
        [x + halfSide, y + halfSide],
        [x - halfSide, y + halfSide],
        [x - halfSide, y - halfSide],
    ];
    return {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ring } }],
    };
}

/**
 * Streamed terrain with satellite imagery.
 *
 * Elevation comes from public Terrarium tiles and imagery from Esri World Imagery;
 * both stream in as the camera moves. A square outline (a vector layer) is draped
 * on the terrain. The map takes its origin from the first layer it loads, so a new
 * place builds a new map on a fresh canvas; the view, height scale and imagery
 * setting carry over. The panel polls on a timer and only reads, so an idle map stays idle.
 */
export class TerrainTiles {
    protected map: AutkMap | null = null;

    private canvas!: HTMLCanvasElement;
    private place: Place = PLACES[0]!;
    private view: View = 'tilted';
    private scale = 1;
    private loading = false;
    /** Bumped on every place change, so a slow load that was overtaken discards itself. */
    private generation = 0;
    private panelTimer: ReturnType<typeof setInterval> | null = null;
    private readonly cleanups: Array<() => void> = [];

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.canvas = canvas;
        const requested = new URLSearchParams(window.location.search).get('place');
        this.place = PLACES.find((place) => place.id === requested) ?? PLACES[0]!;
        this.bindControls();
        this.startPanel();
        await this.loadPlace(this.place);
    }

    /** Stops the panel timer, removes listeners and releases the map. */
    public dispose(): void {
        this.generation++;
        if (this.panelTimer !== null) clearInterval(this.panelTimer);
        this.panelTimer = null;
        for (const cleanup of this.cleanups.splice(0)) cleanup();
        this.map?.destroy();
        this.map = null;
    }

    /** Builds a map for a place on a fresh canvas, replacing the one on screen. */
    private async loadPlace(place: Place): Promise<void> {
        const generation = ++this.generation;
        this.place = place;
        this.loading = true;
        this.markPlace(place);
        this.setText('stats-status', `Loading ${place.label}…`);

        this.map?.destroy();
        this.map = null;
        // A new origin needs a new map, and a new canvas gives it a clean WebGPU context.
        const fresh = document.createElement('canvas');
        this.canvas.replaceWith(fresh);
        this.canvas = fresh;

        const map = new AutkMap(fresh);
        try {
            await map.init();
            if (generation !== this.generation) {
                map.destroy();
                return;
            }
            // Any data layer sets the map origin; here it is the outline, centred on the place.
            map.loadCollection(OUTLINE_LAYER, { collection: outline(place.centerLonLat, place.close / 2), type: 'polylines' });
            map.updateRenderInfo(OUTLINE_LAYER, { color: { r: 255, g: 220, b: 0, alpha: 1 }, polylinesWidth: Math.max(30, place.close / 200) });
            map.loadTiles(TILE_LAYER, { source: TILE_SOURCES.esriWorldImagery });
            this.map = map;
            this.enableTerrain(this.scale);
            map.draw();
        } catch (error) {
            if (generation === this.generation) {
                this.loading = false;
                this.setText('stats-status', `Could not load ${place.label}: ${error instanceof Error ? error.message : String(error)}`);
            }
            map.destroy();
            if (this.map === map) this.map = null;
            return;
        }
        this.loading = false;
        const note = document.getElementById('place-note');
        if (note) note.textContent = place.note;
        const url = new URL(window.location.href);
        url.searchParams.set('place', place.id);
        window.history.replaceState(null, '', url);
    }

    /** Streams terrain at a vertical scale, replacing any terrain already enabled, and keeps the current view. */
    private enableTerrain(verticalScale: number): void {
        if (!this.map) return;
        this.scale = verticalScale;
        this.map.enableTerrainTiles({ source: TERRAIN_TILE_SOURCES.awsTerrarium, verticalScale });
        this.applyImagery();
        this.show(this.view);
    }

    /** Applies the imagery checkbox: hidden imagery shows the terrain triangulation instead. */
    private applyImagery(): void {
        const checkbox = document.getElementById('show-tiles') as HTMLInputElement | null;
        const visible = checkbox ? checkbox.checked : true;
        this.map?.updateRenderInfo(TILE_LAYER, { isSkip: !visible });
        // A new terrain path starts without the mesh, so it is set after every enable.
        this.map?.updateTerrainDebug({ showMesh: !visible });
    }

    /** Points the camera at the centre of the outline, from straight above or tilted towards the south. */
    private show(view: View): void {
        this.view = view;
        const map = this.map;
        if (!map) return;
        const tilt = view === 'tilted' ? TILT : 0;
        const aspect = map.canvas.clientWidth / map.canvas.clientHeight;
        const ground = view === 'wide' ? this.place.wide : this.place.close;
        const extent = ground / Math.min(aspect, 1);
        const distance = (extent * 1.2) / (2 * Math.tan(map.camera.getFovyRadians() / 2));
        const center = [0, 0, 0];
        const eye = [0, -distance * Math.sin(tilt), distance * Math.cos(tilt)];
        map.camera.resetCamera([0, Math.cos(tilt), Math.sin(tilt)], center, eye);
    }

    private bindControls(): void {
        this.on('view-top', 'click', () => this.show('top'));
        this.on('view-tilted', 'click', () => this.show('tilted'));
        this.on('view-wide', 'click', () => this.show('wide'));
        for (const scale of [1, 2, 3]) this.on(`scale-${scale}`, 'click', () => this.enableTerrain(scale));
        this.on('show-tiles', 'change', () => this.applyImagery());
        this.on('timing-reset', 'click', () => this.map?.resetTerrainTileTiming());
        this.on('timing-copy', 'click', () => void this.copyTimings());

        const holder = document.getElementById('places');
        if (holder) {
            holder.replaceChildren();
            for (const place of PLACES) {
                const button = document.createElement('button');
                button.type = 'button';
                button.id = `place-${place.id}`;
                button.textContent = place.label;
                button.title = place.note;
                holder.append(button);
                this.on(button.id, 'click', () => {
                    if (place !== this.place || !this.map) void this.loadPlace(place);
                });
            }
        }
        // Do not keep a timer running for a page that is gone.
        const stop = () => this.dispose();
        window.addEventListener('pagehide', stop);
        this.cleanups.push(() => window.removeEventListener('pagehide', stop));
    }

    private markPlace(place: Place): void {
        for (const candidate of PLACES) {
            document.getElementById(`place-${candidate.id}`)?.setAttribute('aria-pressed', String(candidate === place));
        }
    }

    private on(id: string, type: string, listener: () => void): void {
        const target = document.getElementById(id);
        if (!target) return;
        target.addEventListener(type, listener);
        this.cleanups.push(() => target.removeEventListener(type, listener));
    }

    private startPanel(): void {
        this.updatePanel();
        this.panelTimer = setInterval(() => this.updatePanel(), PANEL_INTERVAL_MS);
    }

    private setText(id: string, value: string): void {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    }

    private updatePanel(): void {
        if (this.loading) return;
        const stats = this.map?.getTerrainTileStats();
        if (!stats) {
            if (this.map) this.setText('stats-status', 'Terrain is not streaming');
            return;
        }
        this.setText('stats-status', describeStatus(stats));
        this.setText('stat-zooms', stats.zooms.join(', '));
        this.setText('stat-tiles', `${stats.readyTiles} / ${stats.wantedTiles}`);
        this.setText('stat-requests-now', `${stats.store.inFlight} / ${stats.store.queued} / ${stats.store.waitingRetries}`);
        this.setText('stat-cache', `${stats.store.cachedTiles} / ${stats.store.cacheLimit}`);
        this.setText('stat-counters', `${stats.store.requests} / ${stats.store.cacheReuses} / ${stats.store.evictions}`);
        const frame = this.map?.renderStats;
        this.setText('stat-frame', frame ? `${frame.lastFrameCpuMs.toFixed(2)} / ${frame.averageFrameCpuMs.toFixed(2)}` : '-');
        this.setText('stat-update', describeTiming(stats.timing.update, true));
        this.setText('stat-compose', describeTiming(stats.timing.compose, true));
        this.setText('stat-windows', describeTiming(stats.timing.windowsPerCompose, false));
        this.setText('stat-upload', describeTiming(stats.timing.upload, true));
        this.setText('stat-memory', `${(stats.memory.total / 1048576).toFixed(0)} MB (tiles ${(stats.memory.decodedTiles / 1048576).toFixed(0)}, windows ${(2 * stats.memory.cpuWindows / 1048576).toFixed(0)} on CPU and GPU)`);
    }

    /** Copies the statistics and timings as JSON, with what is needed to compare runs. */
    private async copyTimings(): Promise<void> {
        const stats = this.map?.getTerrainTileStats();
        if (!stats) return;
        const report = {
            place: this.place.id,
            view: this.view,
            heightScale: this.scale,
            imagery: (document.getElementById('show-tiles') as HTMLInputElement | null)?.checked ?? null,
            canvas: [this.canvas.width, this.canvas.height],
            devicePixelRatio: window.devicePixelRatio,
            userAgent: navigator.userAgent,
            frame: this.map?.renderStats,
            stats,
        };
        const text = JSON.stringify(report, null, 2);
        try {
            await navigator.clipboard.writeText(text);
            this.setText('stats-status', 'Timings copied');
        } catch {
            console.log(text);
            this.setText('stats-status', 'Could not copy; the timings are in the console');
        }
    }
}

/** `p50 / p95 / p99 / max (count)`, in milliseconds when `ms` is set. */
function describeTiming(summary: TimingSummary, ms: boolean): string {
    if (summary.count === 0) return '-';
    const digits = ms ? 2 : 0;
    const n = (value: number) => value.toFixed(digits);
    return `${n(summary.p50)} / ${n(summary.p95)} / ${n(summary.p99)} / ${n(summary.max)} (${summary.count})`;
}

function describeStatus(stats: TerrainTileStats): string {
    return stats.idle ? 'Terrain complete' : 'Loading terrain…';
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new TerrainTiles();
    await example.run(canvas);
}
main();
