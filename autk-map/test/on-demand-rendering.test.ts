import type { FeatureCollection, Geometry } from 'geojson';
import type { Mock, MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraMotion, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import { AutkMap } from '../src/map';
import { FlatMapRenderPath } from '../src/map-flat';
import { TileLayer } from '../src/layer-tiles';
import { RasterLayer } from '../src/layer-raster';
import { Triangles2DLayer } from '../src/layer-triangles2D';
import { SpriteLayer } from '../src/layer-sprite';
import { PolylineLayer } from '../src/layer-polyline';
import { Renderer } from '../src/renderer';
import { PipelineBuildingSSAO } from '../src/pipeline-triangle-ssao';
import { AutkMapUi } from '../src/map-ui';
import { TERRAIN_TILE_SOURCES } from '../src/terrain-tile-source';
import { isStreamingHeightSource } from '../src/height-source';
import { TerrainRenderer } from '../src/renderer-terrain';
import { MapEvent } from '../src/types-events';

/** Stand-in for the terrain render path, which needs a GPU device; it records how the map drives it. */
interface FakeTerrainPath {
    args: unknown[];
    renderFrame: Mock;
}

const terrainPaths = vi.hoisted((): FakeTerrainPath[] => []);

vi.mock('../src/map-terrain', () => ({
    TerrainMapRenderPath: class {
        readonly renderFrame = vi.fn();
        readonly resetCamera = vi.fn();
        readonly updateDebug = vi.fn();
        readonly toggleOverlayBoundsDebug = vi.fn();
        readonly destroy = vi.fn();
        readonly args: unknown[];

        constructor(...args: unknown[]) {
            this.args = args;
            terrainPaths.push(this);
        }
    },
}));

type Listener = (event: Record<string, unknown>) => void;

/** Minimal event target: listeners run in registration order for events fired on it. */
class FakeTarget {
    private readonly listeners = new Map<string, Listener[]>();

    addEventListener(type: string, listener: Listener): void {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    removeEventListener(type: string, listener: Listener): void {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener));
    }

    fire(type: string, init: Record<string, unknown> = {}): void {
        const event = { type, target: this, preventDefault: () => undefined, stopPropagation: () => undefined, ...init };
        for (const listener of this.listeners.get(type) ?? []) {
            listener(event);
        }
    }
}

/** Canvas with the layout, style and focus members the map's event handlers use. */
class FakeCanvas extends FakeTarget {
    width = 400;
    height = 300;
    offsetWidth = 400;
    offsetHeight = 300;
    clientWidth = 400;
    clientHeight = 300;
    offsetTop = 0;
    offsetLeft = 0;
    tabIndex = -1;
    private readonly styleProperties = new Map<string, string>();
    readonly style = {
        touchAction: '',
        outline: '',
        getPropertyValue: (name: string) => this.styleProperties.get(name) ?? '',
        setProperty: (name: string, value: string) => {
            this.styleProperties.set(name, value);
        },
    };

    getBoundingClientRect() {
        return { left: 0, top: 0, width: this.offsetWidth, height: this.offsetHeight };
    }

    focus(): void {
        // Pointer presses focus the canvas; nothing to do here.
    }
}

/** Browser frames under test control: a callback requested during a frame runs in the next one. */
class FakeFrames {
    now = 1000;
    private nextId = 1;
    private readonly callbacks = new Map<number, FrameRequestCallback>();

    install(): void {
        vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
            this.callbacks.set(this.nextId, callback);
            return this.nextId++;
        });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => {
            this.callbacks.delete(id);
        });
    }

    /** Callbacks waiting for the next frame. */
    get pending(): number {
        return this.callbacks.size;
    }

    /** Runs `count` frames, 20 ms apart. A callback cancelled earlier in a frame does not run. */
    run(count = 1): void {
        for (let frame = 0; frame < count; frame++) {
            this.now += 20;
            for (const id of [...this.callbacks.keys()]) {
                const callback = this.callbacks.get(id);
                if (!callback) {
                    continue;
                }
                this.callbacks.delete(id);
                callback(this.now);
            }
        }
    }
}

const square: FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]] },
        properties: { value: 3 },
    }],
};

/** A 2 x 2 raster, usable as a raster layer and as terrain heights. */
function raster(values: number[]): FeatureCollection<Geometry | null> {
    return {
        type: 'FeatureCollection',
        bbox: [0, 0, 100, 100],
        features: [{ type: 'Feature', geometry: null, properties: { rasterResX: 2, rasterResY: 2, band: values } }],
    };
}

let frames: FakeFrames;
let windowTarget: FakeTarget;
let documentTarget: FakeTarget;
let flatFrames: MockInstance;
let renderedEyes: number[][];

beforeEach(() => {
    frames = new FakeFrames();
    frames.install();
    windowTarget = Object.assign(new FakeTarget(), { devicePixelRatio: 1 });
    documentTarget = new FakeTarget();
    vi.stubGlobal('window', windowTarget);
    vi.stubGlobal('document', documentTarget);
    terrainPaths.length = 0;
    renderedEyes = [];

    // Only the WebGPU boundary is replaced: scheduling, input handling, camera, layers and picking state are real.
    vi.spyOn(Renderer.prototype, 'init').mockResolvedValue(undefined);
    vi.spyOn(Renderer.prototype, 'readPickingResults').mockResolvedValue([0]);
    vi.spyOn(Triangles2DLayer.prototype, 'createPipeline').mockImplementation(() => undefined);
    vi.spyOn(RasterLayer.prototype, 'createPipeline').mockImplementation(() => undefined);
    flatFrames = vi.spyOn(FlatMapRenderPath.prototype, 'renderFrame').mockImplementation(function (this: any) {
        renderedEyes.push(this.camera.getEye());
        // Like the real frame: consume a pending pick and read its result back after submission.
        const pendingPick = this.picking.consumePendingPick();
        this.picking.resolvePickingReadback(pendingPick, pendingPick ? 0 : null);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

/** Frames rendered so far by the flat path and by every terrain path. */
function renders(): number {
    return flatFrames.mock.calls.length
        + terrainPaths.reduce((sum, path) => sum + path.renderFrame.mock.calls.length, 0);
}

function flushPromises(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

/** An initialized map with a polygon layer and a raster layer, not yet drawing. */
async function createMap(): Promise<{ map: AutkMap; canvas: FakeCanvas }> {
    const canvas = new FakeCanvas();
    const map = new AutkMap(canvas as unknown as HTMLCanvasElement, false);
    await map.init();
    map.loadCollection('parks', { collection: square, type: 'polygons' });
    map.loadCollection('heat', { collection: raster([1, 2, 3, 4]), type: 'raster', property: 'band' });
    return { map, canvas };
}

/** A map rendering on demand whose first frame has been drawn, so it is idle. */
async function idleOnDemandMap(): Promise<{ map: AutkMap; canvas: FakeCanvas }> {
    const created = await createMap();
    created.map.draw({ onDemand: true });
    frames.run(3);
    return created;
}

/** Pointer events reach the map through its document capture listeners, with the pressed element as target. */
function pointer(type: string, target: unknown, init: Record<string, unknown> = {}): void {
    documentTarget.fire(type, {
        target, pointerType: 'mouse', pointerId: 1, button: 0, buttons: 0, clientX: 0, clientY: 0, ...init,
    });
}

function drag(canvas: FakeCanvas, shiftKey: boolean): void {
    pointer('pointerdown', canvas, { buttons: 1, clientX: 100, clientY: 100 });
    pointer('pointermove', canvas, { buttons: 1, clientX: 140, clientY: 120, shiftKey });
    pointer('pointerup', canvas, { clientX: 140, clientY: 120 });
}

function pinch(canvas: FakeCanvas): void {
    const touch = { pointerType: 'touch', buttons: 1 };
    pointer('pointerdown', canvas, { ...touch, pointerId: 1, clientX: 100, clientY: 100 });
    pointer('pointerdown', canvas, { ...touch, pointerId: 2, clientX: 200, clientY: 100 });
    pointer('pointermove', canvas, { ...touch, pointerId: 2, clientX: 260, clientY: 100 });
    pointer('pointerup', canvas, { ...touch, pointerId: 2, clientX: 260, clientY: 100 });
    pointer('pointerup', canvas, { ...touch, pointerId: 1, clientX: 100, clientY: 100 });
}

type Change = (context: { map: AutkMap; canvas: FakeCanvas }) => void;

const changes: Array<[string, Change]> = [
    ['mouse wheel zoom', ({ canvas }) => canvas.fire('wheel', { deltaY: -120, clientX: 200, clientY: 150 })],
    ['mouse drag pan', ({ canvas }) => drag(canvas, false)],
    ['shift drag orbit', ({ canvas }) => drag(canvas, true)],
    ['two-finger pinch zoom', ({ canvas }) => pinch(canvas)],
    ['window resize', () => windowTarget.fire('resize')],
    ['camera reset with the r key', ({ canvas }) => canvas.fire('keyup', { key: 'r' })],
    ['style cycle with the s key', ({ canvas }) => canvas.fire('keyup', { key: 's' })],
    ['camera move from code', ({ map }) => map.camera.translate(0.05, 0)],
    ['resetCamera() call', ({ map }) => map.resetCamera()],
    ['layer added', ({ map }) => map.loadCollection('water', { collection: square, type: 'water' })],
    ['layer removed', ({ map }) => map.removeLayer('parks')],
    ['thematic update', ({ map }) => map.updateThematic('parks', { collection: square, property: 'properties.value' })],
    ['raster update', ({ map }) => map.updateRaster('heat', { collection: raster([4, 3, 2, 1]), property: 'band' })],
    ['colormap update', ({ map }) => map.updateColorMap('parks', { colorMap: { interpolator: ColorMapInterpolator.SEQ_BLUES } })],
    ['colormap switched on', ({ map }) => map.updateRenderInfo('parks', { isColorMap: true })],
    ['opacity change', ({ map }) => map.updateRenderInfo('parks', { opacity: 0.4 })],
    ['visibility change', ({ map }) => map.updateRenderInfo('parks', { isSkip: true })],
    ['border toggle', ({ map }) => map.updateRenderInfo('parks', { showBorders: false })],
    ['highlight set from code', ({ map }) => map.setHighlightedIds('parks', [0])],
    ['skipped features', ({ map }) => map.setSkippedIds('parks', [0])],
    ['style set from code', ({ map }) => map.style.setPredefinedStyle('light')],
    ['highlight color set from code', ({ map }) => map.style.setHighlightColor('#ff0000')],
];

describe('on-demand rendering', () => {
    it.each([undefined, {}, { onDemand: true }])('draw(%j) renders once and then stays idle', async (options) => {
        const { map } = await createMap();
        const before = renders();

        map.draw(options);
        frames.run(5);

        expect(renders() - before).toBe(1);
        expect(frames.pending).toBe(0);
    });

    it.each(changes)('renders once more after a %s', async (_name, change) => {
        const context = await idleOnDemandMap();
        const before = renders();

        change(context);
        frames.run(3);

        expect(renders() - before).toBe(1);
        expect(frames.pending).toBe(0);
    });

    it('preserves requests made during rendering for a subsequent frame', async () => {
        const { map } = await idleOnDemandMap();
        flatFrames.mockImplementationOnce(() => {
            map.camera.translate(0.05, 0);
            map.requestRender();
        });
        const before = renders();

        map.requestRender();
        frames.run(3);

        expect(renders() - before).toBe(2);
        expect(frames.pending).toBe(0);
    });

    it('detaches the change listener when a layer is removed', async () => {
        const { map } = await idleOnDemandMap();
        const removed = map.layerManager.searchByLayerId('parks')!;
        map.removeLayer('parks');
        frames.run(3);
        const request = vi.spyOn(map, 'requestRender');
        const before = renders();

        removed.updateLayerRenderInfo({ opacity: 0.25 });
        frames.run(3);

        expect(request).not.toHaveBeenCalled();
        expect(renders() - before).toBe(0);
    });

    it('refreshes cached layer uniforms when the style changes', async () => {
        const { map } = await idleOnDemandMap();
        const dirty = map.layerManager.layers.map(layer => vi.spyOn(layer, 'makeLayerRenderInfoDirty'));

        map.style.setHighlightColor('#123456');

        for (const mark of dirty) {
            expect(mark).toHaveBeenCalledOnce();
        }
        frames.run(3);
        expect(frames.pending).toBe(0);
    });

    it('requires an explicit dirty mark after direct render-state mutation', async () => {
        const { map } = await idleOnDemandMap();
        const layer = map.layerManager.searchByLayerId('parks')!;
        const before = renders();

        layer.layerRenderInfo.opacity = 0.25;
        frames.run(3);
        expect(renders() - before).toBe(0);

        layer.makeLayerRenderInfoDirty();
        map.requestRender();
        frames.run(3);
        expect(renders() - before).toBe(1);
        expect(frames.pending).toBe(0);
    });

    it('redraws point and line size updates without reloading geometry', async () => {
        vi.spyOn(SpriteLayer.prototype, 'createPipeline').mockImplementation(() => undefined);
        vi.spyOn(PolylineLayer.prototype, 'createPipeline').mockImplementation(() => undefined);
        const { map } = await idleOnDemandMap();
        map.loadCollection('points', { collection: {
            type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
                geometry: { type: 'Point', coordinates: [0, 0] } }],
        }, type: 'points' });
        map.loadCollection('lines', { collection: {
            type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
                geometry: { type: 'LineString', coordinates: [[0, 0], [10, 10]] } }],
        }, type: 'polylines' });
        frames.run(3);
        const reloadPoints = vi.spyOn(SpriteLayer.prototype, 'loadLayerData');
        const reloadLines = vi.spyOn(PolylineLayer.prototype, 'loadLayerData');
        const before = renders();

        map.updateRenderInfo('points', { renderInfo: { pointSize: 120 } });
        map.updateRenderInfo('lines', { renderInfo: { polylinesWidth: 24 } });
        frames.run(3);

        expect(renders() - before).toBe(1);
        expect(reloadPoints).not.toHaveBeenCalled();
        expect(reloadLines).not.toHaveBeenCalled();
        expect(frames.pending).toBe(0);
    });

    it('renders a burst of changes made in one frame once', async () => {
        const { map, canvas } = await idleOnDemandMap();
        const before = renders();

        canvas.fire('wheel', { deltaY: -120, clientX: 200, clientY: 150 });
        drag(canvas, false);
        windowTarget.fire('resize');
        map.updateRenderInfo('parks', { opacity: 0.5 });
        map.setHighlightedIds('parks', [0]);
        map.style.setPredefinedStyle('osm');
        map.loadCollection('water', { collection: square, type: 'water' });
        frames.run(3);

        expect(renders() - before).toBe(1);
        expect(frames.pending).toBe(0);
    });

    it('renders nothing for pointer, click and key input that changes nothing', async () => {
        const { canvas } = await idleOnDemandMap();
        const otherCanvas = new FakeTarget();
        const before = renders();

        pointer('pointermove', canvas, { clientX: 120, clientY: 80 });
        pointer('pointermove', canvas, { clientX: 160, clientY: 90 });
        // The map listens on the document, so it also sees drags over other elements.
        pointer('pointerdown', otherCanvas, { buttons: 1, clientX: 30, clientY: 40 });
        pointer('pointermove', otherCanvas, { buttons: 1, clientX: 60, clientY: 40 });
        pointer('pointerup', otherCanvas, { clientX: 60, clientY: 40 });
        // A click without movement, and a double click while no layer is pick-enabled.
        pointer('pointerdown', canvas, { buttons: 1, clientX: 50, clientY: 50 });
        pointer('pointerup', canvas, { clientX: 50, clientY: 50 });
        canvas.fire('dblclick', { clientX: 50, clientY: 50 });
        canvas.fire('keyup', { key: 'x' });
        frames.run(3);

        expect(renders() - before).toBe(0);
        expect(frames.pending).toBe(0);
    });

    it('renders the picking frame of a double click, then once more for the highlight it changed', async () => {
        const { map, canvas } = await idleOnDemandMap();
        map.updateRenderInfo('parks', { isPick: true });
        frames.run(3);
        const picked = vi.fn();
        map.events.on(MapEvent.PICKING, picked);
        const before = renders();

        canvas.fire('dblclick', { clientX: 50, clientY: 50 });
        frames.run(3);
        expect(renders() - before).toBe(1);

        // The picking readback lands after the frame and toggles the highlight of feature 0.
        await flushPromises();
        frames.run(3);

        expect(picked).toHaveBeenCalledWith({ selection: [0], layerId: 'parks' });
        expect(renders() - before).toBe(2);
        expect(frames.pending).toBe(0);
    });

    it('renders every step of a CameraMotion animation and stops once it settles', async () => {
        const { map } = await idleOnDemandMap();
        vi.spyOn(performance, 'now').mockImplementation(() => frames.now);
        const before = renders();

        let settled = false;
        void new CameraMotion().zoomOut(2, 0.1).play(map.camera).then(() => {
            settled = true;
        });
        for (let frame = 0; frame < 30 && !settled; frame++) {
            await flushPromises();
            frames.run();
        }
        await flushPromises();
        frames.run(3);

        // 100 ms of motion in 20 ms frames is five camera steps, each drawn once, the last where the camera stopped.
        expect(settled).toBe(true);
        expect(renders() - before).toBe(5);
        expect(renderedEyes[renderedEyes.length - 1]).toEqual(map.camera.getEye());
        expect(frames.pending).toBe(0);
    });

    it('switches a map that is drawing continuously to on-demand rendering and back', async () => {
        const { map, canvas } = await createMap();
        map.draw({ onDemand: false });
        let before = renders();
        frames.run(3);
        expect(renders() - before).toBe(3);

        map.draw({ onDemand: true });
        before = renders();
        frames.run(5);
        expect(renders() - before).toBe(1);
        expect(frames.pending).toBe(0);

        canvas.fire('wheel', { deltaY: -120, clientX: 200, clientY: 150 });
        frames.run(3);
        expect(renders() - before).toBe(2);
        expect(frames.pending).toBe(0);

        map.draw({ onDemand: false });
        before = renders();
        frames.run(3);
        expect(renders() - before).toBe(3);
    });

    it('switches to on-demand rendering before the continuous loop drew its first frame', async () => {
        const { map } = await createMap();
        const before = renders();

        map.draw({ onDemand: false });
        map.draw({ onDemand: true });
        frames.run(5);

        expect(renders() - before).toBe(1);
        expect(frames.pending).toBe(0);
    });

    it('requestRender() schedules one frame however often it is called, and only in on-demand mode', async () => {
        const { map } = await createMap();
        let before = renders();

        map.requestRender();
        frames.run(3);
        expect(renders() - before).toBe(0);

        map.draw({ onDemand: true });
        frames.run(3);
        before = renders();
        map.requestRender();
        map.requestRender();
        map.requestRender();
        frames.run(3);
        expect(renders() - before).toBe(1);
        expect(frames.pending).toBe(0);

        map.draw({ onDemand: false });
        frames.run(1);
        before = renders();
        map.requestRender();
        expect(frames.pending).toBe(1);
        frames.run(1);
        expect(renders() - before).toBe(1);

        map.destroy();
        map.requestRender();
        frames.run(3);
        expect(renders() - before).toBe(1);
        expect(frames.pending).toBe(0);
    });
});

describe('render statistics', () => {
    it('counts the frames that are rendered, measures their CPU time, and stops counting when the map is idle', async () => {
        // The fake clock is installed before the setup frames render, so every timestamp shares one clock.
        vi.spyOn(performance, 'now').mockImplementation(() => frames.now);
        const { map } = await idleOnDemandMap();
        flatFrames.mockImplementation(() => { frames.now += 3; }); // each frame now costs 3 ms of CPU; setup frames cost 0

        const first = map.renderStats.frameCount;
        frames.run(10); // idle: nothing asks for a frame
        expect(map.renderStats.frameCount).toBe(first);

        for (let i = 0; i < 4; i++) {
            map.requestRender();
            frames.run(1);
        }
        const busy = map.renderStats;
        expect(busy.frameCount).toBe(first + 4);
        expect(busy.lastFrameCpuMs).toBeCloseTo(3, 6);
        expect(busy.averageFrameCpuMs).toBeGreaterThan(0); // the average also holds the free setup frames
        expect(busy.averageFrameCpuMs).toBeLessThan(3);
        expect(busy.framesPerSecond).toBeGreaterThan(0);

        frames.run(100); // two seconds of nothing
        const idle = map.renderStats;
        expect(idle.frameCount).toBe(busy.frameCount); // a stalled count is how a page sees an idle map
        expect(idle.framesPerSecond).toBe(0); // and the rate does not keep its last value
        expect(frames.pending).toBe(0);
    });

    it('reading the statistics does not ask for a frame', async () => {
        const { map } = await idleOnDemandMap();
        const before = renders();
        for (let i = 0; i < 20; i++) void map.renderStats;
        frames.run(3);
        expect(renders() - before).toBe(0);
        expect(frames.pending).toBe(0);
    });

    it('does not count a frame that failed', async () => {
        const { map } = await idleOnDemandMap();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const before = map.renderStats.frameCount;
        flatFrames.mockImplementationOnce(() => { throw new Error('device lost'); });
        map.requestRender();
        frames.run(2);
        expect(map.renderStats.frameCount).toBe(before);
        map.requestRender();
        frames.run(2);
        expect(map.renderStats.frameCount).toBe(before + 1);
    });
});

describe('continuous rendering and teardown', () => {
    it('adds linked branding even without map controls, tracks resize and cleans up on destroy', async () => {
        const canvas = new FakeCanvas();
        const parent = { appendChild: vi.fn() };
        Object.assign(canvas, { parentElement: parent });
        const makeElement = () => ({ style: {}, className: '', textContent: '', href: '', children: [] as any[],
            appendChild(child: any) { this.children.push(child); }, remove: vi.fn() });
        const branding = makeElement();
        Object.assign(documentTarget, { createElement: vi.fn().mockReturnValueOnce(branding).mockImplementation(makeElement),
            createTextNode: (text: string) => ({ textContent: text }) });
        const observe = vi.fn();
        const disconnect = vi.fn();
        let resized = () => undefined;
        vi.stubGlobal('ResizeObserver', class {
            constructor(callback: () => undefined) { resized = callback; }
            observe = observe;
            disconnect = disconnect;
        });
        const map = new AutkMap(canvas as unknown as HTMLCanvasElement, false);
        await map.init();
        map.ui.buildBranding();

        expect(parent.appendChild).toHaveBeenCalledOnce();
        const strip = branding.children[0];
        const link = strip.children[0];
        expect(link.textContent).toBe('Made with Autark');
        expect(link.href).toBe('https://www.autarkjs.org');
        expect(link.target).toBe('_blank');
        expect(link.rel).toBe('noopener noreferrer');
        expect(strip.style).toMatchObject({ left: '10px', bottom: '10px' });
        expect(branding.style).toMatchObject({ pointerEvents: 'none', width: '400px', height: '300px' });
        expect(observe).toHaveBeenCalledWith(canvas);
        canvas.offsetWidth = 200;
        canvas.offsetTop = 30;
        resized();
        expect(branding.style).toMatchObject({ width: '200px', top: '30px' });
        canvas.offsetHeight = 0;
        resized();
        expect(branding.style).toMatchObject({ display: 'none' });

        map.draw();
        frames.run(3);
        expect(frames.pending).toBe(0);
        map.destroy();
        expect(branding.remove).toHaveBeenCalledOnce();
        expect(disconnect).toHaveBeenCalledOnce();
    });

    it('uses continuous rendering when fps is provided as an option', async () => {
        const { map } = await createMap();
        const before = renders();
        map.draw({ fps: 30 });
        frames.run(4);
        expect(renders() - before).toBe(2);
        expect(frames.pending).toBe(1);
    });

    it('detaches layer and style listeners on destroy', async () => {
        const { map } = await idleOnDemandMap();
        const layer = map.layerManager.searchByLayerId('parks')!;
        map.destroy();
        const request = vi.spyOn(map, 'requestRender');

        layer.makeLayerDataDirty();
        map.style.setPredefinedStyle('light');

        expect(request).not.toHaveBeenCalled();
        expect(frames.pending).toBe(0);
    });

    it('releases its renderer\'s shared SSAO textures on destroy', async () => {
        const release = vi.spyOn(PipelineBuildingSSAO, 'releaseSharedState');
        const { map } = await idleOnDemandMap();
        const renderer = (map as unknown as { _renderer: Renderer })._renderer;

        map.destroy();

        expect(release).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledWith(renderer);
    });
    it('keeps drawing continuously with explicit options and draw(fps)', async () => {
        const { map, canvas } = await createMap();
        let before = renders();

        map.draw({ onDemand: false });
        frames.run(4);
        expect(renders() - before).toBe(4);

        canvas.fire('wheel', { deltaY: -120, clientX: 200, clientY: 150 });
        map.updateRenderInfo('parks', { opacity: 0.5 });
        expect(frames.pending).toBe(1);
        frames.run(1);
        expect(renders() - before).toBe(5);

        // 30 fps with frames 20 ms apart draws every other frame.
        map.draw(30);
        before = renders();
        frames.run(4);
        expect(renders() - before).toBe(2);
    });

    it('renders nothing after init until draw is called', async () => {
        const { map, canvas } = await createMap();
        const before = renders();

        canvas.fire('wheel', { deltaY: -120, clientX: 200, clientY: 150 });
        map.updateRenderInfo('parks', { opacity: 0.5 });
        map.style.setPredefinedStyle('light');
        frames.run(3);

        expect(renders() - before).toBe(0);
        expect(frames.pending).toBe(0);
    });

    it.each([
        ['continuously', (map: AutkMap) => map.draw({ onDemand: false })],
        ['on demand', (map: AutkMap) => map.draw({ onDemand: true })],
    ])('never renders a destroyed map that was drawing %s', async (_mode, draw) => {
        const { map, canvas } = await createMap();
        draw(map);
        frames.run(2);
        canvas.fire('wheel', { deltaY: -120, clientX: 200, clientY: 150 });
        const before = renders();

        map.destroy();
        frames.run(3);
        map.camera.zoom(-1, 0.5, 0.5);
        map.updateRenderInfo('parks', { opacity: 0.2 });
        frames.run(3);

        expect(renders() - before).toBe(0);
        expect(frames.pending).toBe(0);
    });

    it('ignores a picking result that lands after destroy', async () => {
        const { map, canvas } = await idleOnDemandMap();
        map.updateRenderInfo('parks', { isPick: true });
        frames.run(3);
        canvas.fire('dblclick', { clientX: 50, clientY: 50 });
        frames.run(1);
        const before = renders();

        map.destroy();
        await flushPromises();
        frames.run(3);

        expect(renders() - before).toBe(0);
        expect(frames.pending).toBe(0);
    });
});

describe('terrain tiles', () => {
    it.each([NaN, Infinity, -1, 63, 4097, 128.5])('rejects an invalid overlay size before creating terrain: %s', async overlaySize => {
        const { map } = await createMap();
        expect(() => map.enableTerrainTiles({ source: TERRAIN_TILE_SOURCES.awsTerrarium, overlaySize })).toThrow(/overlaySize/);
        expect(terrainPaths).toHaveLength(0);
        expect(map.getTerrainTileStats()).toBeNull();
    });
    /** Tile requests that never answer, and stop when aborted: nothing reaches the network. */
    function stubTileNetwork(): Array<{ url: string; signal: AbortSignal }> {
        const requests: Array<{ url: string; signal: AbortSignal }> = [];
        vi.stubGlobal('fetch', (url: string, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
            requests.push({ url, signal: init.signal });
            init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));
        return requests;
    }

    it('needs the map origin, which the first data layer defines', async () => {
        const map = new AutkMap(new FakeCanvas() as unknown as HTMLCanvasElement, false);
        await map.init();
        expect(() => map.enableTerrainTiles({ source: TERRAIN_TILE_SOURCES.awsTerrarium })).toThrow(/origin/);
    });

    it('rejects an invalid source before creating anything', async () => {
        const { map } = await createMap();
        expect(() => map.enableTerrainTiles({ source: { ...TERRAIN_TILE_SOURCES.awsTerrarium, encoding: 'rgb' } as never })).toThrow(/encoding/);
        expect(terrainPaths).toHaveLength(0);
        expect(map.getTerrainTileStats()).toBeNull();
    });

    it('drives the terrain path with a streaming height source, requests coarse tiles first, and credits the source', async () => {
        const requests = stubTileNetwork();
        const credits = vi.spyOn(AutkMapUi.prototype, 'setAttribution');
        const { map } = await idleOnDemandMap();

        map.enableTerrainTiles({ source: TERRAIN_TILE_SOURCES.awsTerrarium, windowSize: 64 });
        expect(terrainPaths).toHaveLength(1);
        const heights = terrainPaths[0].args[5] as Parameters<typeof isStreamingHeightSource>[0];
        expect(isStreamingHeightSource(heights)).toBe(true);
        expect(heights.levels).toHaveLength(6);

        expect(requests.length).toBeGreaterThan(0);
        expect(requests[0]!.url).toMatch(/terrarium\/8\//);
        const stats = map.getTerrainTileStats();
        expect(stats).toMatchObject({ levels: 6, windowSize: 64, readyTiles: 0 });
        expect(stats!.zooms).toEqual([14, 13, 12, 11, 10, 9]);
        expect(credits.mock.calls.at(-1)![0].some((credit) => credit.text.includes('Mapzen'))).toBe(true);

        (heights as unknown as { destroy(): void }).destroy();
        expect(requests.every((request) => request.signal.aborted)).toBe(true);
    });

    it('renders once more when a tile arrives, through the map', async () => {
        stubTileNetwork();
        const { map } = await idleOnDemandMap();
        map.enableTerrainTiles({ source: TERRAIN_TILE_SOURCES.awsTerrarium, windowSize: 64 });
        frames.run(3);
        const requestFrame = (terrainPaths[0].args[6] as () => void);
        expect(requestFrame).toBeTypeOf('function');
        const before = renders();
        requestFrame();
        frames.run(3);
        expect(renders() - before).toBe(1);
        (terrainPaths[0].args[5] as any).destroy();
    });

    it('forgets the streamed terrain and its credit when terrain mode is disabled or replaced', async () => {
        stubTileNetwork();
        const credits = vi.spyOn(AutkMapUi.prototype, 'setAttribution');
        const { map } = await idleOnDemandMap();

        map.enableTerrainTiles({ source: TERRAIN_TILE_SOURCES.awsTerrarium, windowSize: 64 });
        const first = terrainPaths[0].args[5] as any;
        expect(map.getTerrainTileStats()).not.toBeNull();

        map.enableTerrainMode(raster([10, 20, 30, 40]), 'band');
        expect(terrainPaths[0].destroy).toHaveBeenCalledOnce();
        expect(map.getTerrainTileStats()).toBeNull();
        expect(credits.mock.calls.at(-1)![0]).toEqual([]);

        map.disableTerrainMode();
        expect(map.getTerrainTileStats()).toBeNull();
        first.destroy();
    });
});

describe('unified terrain loading', () => {
    const source = TERRAIN_TILE_SOURCES.awsTerrarium;
    const imagery = { urlTemplate: 'https://tiles.example/{z}/{x}/{y}.png', attribution: 'Example' };
    const center = { latitude: -22.96, longitude: -43.2075 };

    beforeEach(() => {
        vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }));
        vi.spyOn(TileLayer.prototype, 'createPipeline').mockImplementation(() => {});
    });

    it('reuses a vector map origin, camera, and CRS without center or zoom', async () => {
        const { map } = await createMap();
        map.camera.pitch(-0.4);
        const origin = [...map.layerManager.origin], eye = [...map.camera.getEye()], target = [...map.camera.getLookAt()];
        map.loadTerrain({ source, windowSize: 16 });
        map.loadTiles('imagery', { source: imagery });
        expect(map.layerManager.origin).toEqual(origin);
        expect(map.camera.getEye()).toEqual(eye);
        expect(map.camera.getLookAt()).toEqual(target);
        expect(map.workspaceCrs).toBe('EPSG:3395');
        expect(terrainPaths[0].args[8]).toBe(false);
        map.removeTerrain();
        expect(map.layerManager.searchByLayerId('imagery')).toBeInstanceOf(TileLayer);
        expect(map.layerManager.searchByLayerId('parks')).not.toBeNull();
        expect(map.camera.getEye()).toEqual(eye);
        map.destroy();
    });

    it('initializes terrain without imagery and later reuses its context for imagery', async () => {
        const map = new AutkMap(new FakeCanvas() as unknown as HTMLCanvasElement, false);
        await map.init();
        expect(() => map.loadTerrain({ source })).toThrow(/origin|center/);
        map.loadTerrain({ source, center, zoom: 14, windowSize: 16 });
        expect(map.layerManager.layers).toHaveLength(0);
        expect(map.layerManager.hasOrigin).toBe(true);
        const origin = [...map.layerManager.origin], eye = [...map.camera.getEye()];
        map.loadTiles('imagery', { source: imagery });
        expect(map.layerManager.origin).toEqual(origin);
        expect(map.camera.getEye()).toEqual(eye);
        map.destroy();
    });

    it('inherits a custom workspace CRS and rejects a conflicting layer', async () => {
        const map = new AutkMap(new FakeCanvas() as unknown as HTMLCanvasElement, false, { crs: 'EPSG:3857' });
        await map.init();
        map.loadCollection('parks', { collection: square, type: 'parks' });
        map.loadTerrain({ source, windowSize: 16 });
        map.loadTiles('imagery', { source: imagery });
        expect(map.workspaceCrs).toBe('EPSG:3857');
        const path = terrainPaths[0];
        expect(() => map.loadTerrain({ source, crs: 'EPSG:3395' })).toThrow(/Workspace CRS/);
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        map.loadTiles('wrong', { source: imagery, crs: 'EPSG:3395' });
        expect(log).toHaveBeenCalledWith(expect.stringContaining('Workspace CRS'));
        expect(map.layerManager.searchByLayerId('wrong')).toBeNull();
        expect(terrainPaths).toEqual([path]);
        map.destroy();
    });

    it('preserves the existing first-load CRS parameter for custom vector workspaces', async () => {
        const { map } = await createMap();
        map.loadTiles('imagery', { source: imagery, crs: 'EPSG:3857' });
        map.loadTerrain({ source, windowSize: 16 });
        expect(map.workspaceCrs).toBe('EPSG:3857');
        expect(map.getTerrainTileStats()).not.toBeNull();
        expect(() => map.loadTerrain({ source, crs: 'EPSG:3395' })).toThrow(/Workspace CRS/);
        map.destroy();
    });

    it('validates fixed terrain without modifying database data and exposes shared diagnostics', async () => {
        const { map } = await createMap();
        const data = new Array(81).fill(-430); data[40] = -3000;
        const collection: FeatureCollection<Geometry | null> = { type: 'FeatureCollection', bbox: [0, 0, 100, 100],
            features: [{ type: 'Feature', geometry: null, properties: { rasterResX: 9, rasterResY: 9, band: data } }] };
        map.loadTerrain({ source: { collection, property: 'band' } });
        expect((terrainPaths.at(-1)!.args[5] as { data: Float32Array }).data[40]).toBe(-430);
        expect(data[40]).toBe(-3000);
        expect(map.getTerrainValidationStats()).toMatchObject({ rejected: 1, corrected: 1 });
        const count = terrainPaths.length;
        expect(() => map.loadTerrain({ source: { collection, property: 'band' }, validation: { minDeviation: NaN } })).toThrow(/finite and positive/);
        expect(terrainPaths).toHaveLength(count);
        map.loadTerrain({ source: { collection, property: 'band' }, validation: false });
        expect((terrainPaths.at(-1)!.args[5] as { data: Float32Array }).data[40]).toBe(-3000);
        expect(map.getTerrainValidationStats()).toBeNull();
        map.removeTerrain();
        expect(map.getTerrainValidationStats()).toBeNull();
        map.destroy();
    });

    it('loads raster terrain through the same lifecycle and preserves active terrain on invalid input', async () => {
        const map = new AutkMap(new FakeCanvas() as unknown as HTMLCanvasElement, false);
        await map.init();
        expect(() => map.loadTerrain({ source, center, zoom: NaN })).toThrow(/zoom/);
        expect(map.layerManager.hasOrigin).toBe(false);
        map.loadTerrain({ source: { collection: raster([10, 20, 30, 40]), property: 'band' }, verticalScale: 2 });
        expect((terrainPaths[0].args[5] as { data: Float32Array }).data[0]).toBe(20);
        expect(map.layerManager.origin).toEqual([50, 50]);
        expect(map.layerManager.layers).toHaveLength(0);
        expect(map.getTerrainTileStats()).toBeNull();
        const path = terrainPaths[0];
        expect(() => map.loadTerrain({ source: { collection: raster([]), property: 'missing' } })).toThrow();
        expect(terrainPaths).toEqual([path]);
        expect((path as any).destroy).not.toHaveBeenCalled();
        map.removeTerrain();
        expect((path as any).destroy).toHaveBeenCalledOnce();
        map.destroy();
    });
});

describe('terrain mode on demand', () => {
    it('renders once when terrain mode is enabled, its debug options or overlay bounds change, and it is disabled', async () => {
        const { map, canvas } = await idleOnDemandMap();
        let before = renders();

        map.enableTerrainMode(raster([10, 20, 30, 40]), 'band');
        frames.run(3);
        expect(renders() - before).toBe(1);
        expect(terrainPaths[0].renderFrame).toHaveBeenCalledOnce();

        const terrainChanges = [
            () => map.updateTerrainDebug({ showMesh: true }),
            () => canvas.fire('keyup', { key: 'b' }),
            () => map.disableTerrainMode(),
        ];
        for (const change of terrainChanges) {
            before = renders();
            change();
            frames.run(3);
            expect(renders() - before).toBe(1);
        }
        expect(frames.pending).toBe(0);
    });

    it('gives the terrain path a way to request a frame for GPU work that lands after a frame', async () => {
        const { map } = await idleOnDemandMap();
        map.enableTerrainMode(raster([10, 20, 30, 40]), 'band');
        frames.run(3);
        const requestFrame = terrainPaths[0].args.find((arg) => typeof arg === 'function') as (() => void) | undefined;
        expect(requestFrame).toBeTypeOf('function');
        const before = renders();

        requestFrame?.();
        requestFrame?.();
        frames.run(3);

        expect(renders() - before).toBe(1);
        expect(frames.pending).toBe(0);
    });

    it('reports new visible terrain bounds after a readback only when they changed', async () => {
        vi.stubGlobal('GPUMapMode', { READ: 1 });
        const readbacks = [[0, 0, 10, 10], [0, 0, 10, 10], [5, 0, 20, 10]];
        let next = 0;
        const terrain = Object.assign(Object.create(TerrainRenderer.prototype), {
            boundsReadbackPending: false,
            boundsReadbackInFlight: false,
            latestReducedBounds: null,
            reduceReadback: {
                mapAsync: () => Promise.resolve(),
                getMappedRange: () => new Float32Array(readbacks[next++]).buffer,
                unmap: () => undefined,
            },
        }) as TerrainRenderer;
        const boundsChanged = vi.fn();

        for (const expectedCalls of [1, 1, 2]) {
            // Each terrain frame queues one copy of the reduced bounds; resolving maps it.
            (terrain as any).boundsReadbackPending = true;
            terrain.resolveVisibleBoundsReadback(boundsChanged);
            await flushPromises();
            expect(boundsChanged).toHaveBeenCalledTimes(expectedCalls);
        }
        expect(terrain.visibleBounds).toEqual([5, 0, 20, 10]);
    });

    it('asks for one more frame when a frame drew while a terrain readback was in flight, even if the bounds stay the same', async () => {
        vi.stubGlobal('GPUMapMode', { READ: 1 });
        let land: () => void = () => undefined;
        const terrain = Object.assign(Object.create(TerrainRenderer.prototype), {
            boundsReadbackPending: false,
            boundsReadbackInFlight: false,
            latestReducedBounds: [0, 0, 10, 10],
            reduceReadback: {
                mapAsync: () => new Promise<void>((resolve) => {
                    land = resolve;
                }),
                getMappedRange: () => new Float32Array([0, 0, 10, 10]).buffer,
                unmap: () => undefined,
            },
        }) as TerrainRenderer;
        const requestFrame = vi.fn();

        // Frame 1 queues a readback; frame 2 draws a new view before it lands, so its own copy is skipped.
        (terrain as any).boundsReadbackPending = true;
        terrain.resolveVisibleBoundsReadback(requestFrame);
        terrain.resolveVisibleBoundsReadback(requestFrame);
        land();
        await flushPromises();
        expect(requestFrame).toHaveBeenCalledOnce();

        // The frame it asked for reads back its own view; the same bounds again need nothing more.
        (terrain as any).boundsReadbackPending = true;
        terrain.resolveVisibleBoundsReadback(requestFrame);
        land();
        await flushPromises();
        expect(requestFrame).toHaveBeenCalledOnce();
    });
});


describe('transactional tile integration', () => {
    const source = { urlTemplate: 'https://tiles.example/{z}/{x}/{y}.png', attribution: 'Example' };

    it('removes a failed tile layer and permits retrying the same ID', async () => {
        const { map } = await createMap();
        const log = vi.spyOn(console, 'error').mockImplementation(() => {});
        const destroy = vi.spyOn(TileLayer.prototype, 'destroy');
        const create = vi.spyOn(TileLayer.prototype, 'createPipeline').mockImplementationOnce(() => { throw new Error('GPU setup failed'); });
        map.loadTiles('basemap', { source });
        expect(map.layerManager.searchByLayerId('basemap')).toBeNull();
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(map.layerManager.searchByLayerId('parks')).not.toBeNull();
        expect(log).toHaveBeenCalledWith(expect.stringContaining('GPU setup failed'));
        create.mockImplementation(() => {});
        map.loadTiles('basemap', { source });
        expect(map.layerManager.searchByLayerId('basemap')).toBeInstanceOf(TileLayer);
        expect(map.layerManager.layers[0]!.layerInfo.id).toBe('basemap');
        map.destroy();
    });

    it('rejects invalid configuration without touching existing layers or a duplicate ID', async () => {
        const { map } = await createMap();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const create = vi.spyOn(TileLayer.prototype, 'createPipeline').mockImplementation(() => {});
        map.loadTiles('invalid', { source, crs: 'EPSG:9999' as never });
        map.loadTiles('bad-limit', { source, maxCachedTiles: NaN });
        expect(create).not.toHaveBeenCalled();
        const parks = map.layerManager.searchByLayerId('parks');
        map.loadTiles('parks', { source });
        expect(map.layerManager.searchByLayerId('parks')).toBe(parks);
        expect(map.layerManager.layers).toHaveLength(2);
        map.destroy();
    });
});

describe('tile-only geographic views', () => {
    const source = { urlTemplate: 'https://tiles.example/{z}/{x}/{y}.png', attribution: 'Example' };
    const center = { latitude: 0, longitude: 0 };

    it('creates a standalone tile map and preserves its origin when adding overlays and another centered view', async () => {
        const map = new AutkMap(new FakeCanvas() as unknown as HTMLCanvasElement, false);
        await map.init();
        vi.spyOn(TileLayer.prototype, 'createPipeline').mockImplementation(() => {});
        map.loadTiles('imagery', { source, center, zoom: 12 });
        expect(map.layerManager.layers.map(layer => layer.layerInfo.typeLayer)).toEqual(['tiles']);
        expect(map.layerManager.origin[0]).toBeCloseTo(0, 6);
        expect(map.layerManager.origin[1]).toBeCloseTo(0, 6);
        expect(map.camera.getLookAt()).toEqual([0, 0, 0]);
        const distance = map.camera.getEye()[2];
        const origin = [...map.layerManager.origin];
        map.loadCollection('parks', { collection: square, type: 'polygons' });
        map.loadTiles('second', { source, center, zoom: 13 });
        expect(map.layerManager.origin).toEqual(origin);
        expect(map.camera.getEye()[2]).toBeCloseTo(distance / 2, 3);
        map.destroy();
    });

    it('does not initialize an origin on invalid geographic views or failed GPU setup', async () => {
        const map = new AutkMap(new FakeCanvas() as unknown as HTMLCanvasElement, false);
        await map.init();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const create = vi.spyOn(TileLayer.prototype, 'createPipeline').mockImplementation(() => { throw new Error('GPU failure'); });
        for (const config of [{ zoom: 12 }, { center, zoom: NaN }, { center, zoom: -1 },
            { center: { latitude: 90, longitude: 0 } }, { center: { latitude: 0, longitude: 181 } }]) {
            map.loadTiles('invalid', { source, ...config });
        }
        expect(create).not.toHaveBeenCalled();
        map.loadTiles('failed', { source, center, zoom: 12 });
        expect(map.layerManager.hasOrigin).toBe(false);
        expect(map.layerManager.layers).toHaveLength(0);
        map.destroy();
    });

    it('uses zoom 12 when only a center is supplied and adapts clipping to degree-based coordinates', async () => {
        const map = new AutkMap(new FakeCanvas() as unknown as HTMLCanvasElement, false);
        await map.init();
        vi.spyOn(TileLayer.prototype, 'createPipeline').mockImplementation(() => {});
        map.loadTiles('imagery', { source, center });
        const defaultDistance = map.camera.getEye()[2];
        map.loadTiles('explicit', { source, center, zoom: 12 });
        expect(map.camera.getEye()[2]).toBe(defaultDistance);
        map.destroy();
        const degrees = new AutkMap(new FakeCanvas() as unknown as HTMLCanvasElement, false, { crs: 'EPSG:4326' });
        await degrees.init();
        degrees.loadTiles('degrees', { source, center, zoom: 12 });
        expect(degrees.layerManager.searchByLayerId('degrees')).toBeInstanceOf(TileLayer);
        expect(degrees.camera.getNear()).toBeLessThan(degrees.camera.getEye()[2]);
        expect(degrees.camera.getNear()).toBeGreaterThan(0);
        expect(() => degrees.loadTerrain({ source: TERRAIN_TILE_SOURCES.awsTerrarium })).toThrow(/metre-based/);
        degrees.destroy();
    });
});
