import type { FeatureCollection, Geometry } from 'geojson';
import type { Mock, MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraMotion, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import { AutkMap } from '../src/map';
import { FlatMapRenderPath } from '../src/map-flat';
import { RasterLayer } from '../src/layer-raster';
import { Triangles2DLayer } from '../src/layer-triangles2D';
import { Renderer } from '../src/renderer';
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
    it('renders once after draw({ onDemand: true }) and then stays idle', async () => {
        const { map } = await createMap();
        const before = renders();

        map.draw({ onDemand: true });
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
        map.draw();
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

        map.draw();
        before = renders();
        frames.run(3);
        expect(renders() - before).toBe(3);
    });

    it('switches to on-demand rendering before the continuous loop drew its first frame', async () => {
        const { map } = await createMap();
        const before = renders();

        map.draw();
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

        map.draw();
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

describe('continuous rendering and teardown', () => {
    it('keeps drawing every frame with draw() and draw(fps), as before', async () => {
        const { map, canvas } = await createMap();
        let before = renders();

        map.draw();
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
        ['continuously', (map: AutkMap) => map.draw()],
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
