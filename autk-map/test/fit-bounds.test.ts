import type { FeatureCollection, Polygon } from 'geojson';
import { describe, expect, it, vi } from 'vitest';
import { AutkMap } from '../src/map';
import { LayerManager } from '../src/layer-manager';
import { FlatMapRenderPath } from '../src/map-flat';
import { MapCamera } from '../src/map-camera';
import { vec4 } from 'gl-matrix';

/** A flat render path over a fake camera that records where it is put, on a canvas `width` x `height` pixels. */
function flatPath(width: number, height: number, fovy = Math.PI / 2) {
    const camera = { getFovyRadians: () => fovy, resetCamera: vi.fn(), resize: vi.fn() };
    const renderer = { pixelWidth: width, pixelHeight: height };
    const path = new FlatMapRenderPath(renderer as never, camera as never, {} as never, {} as never);
    return { path, camera };
}

const square = (x0: number, y0: number, x1: number, y1: number): Polygon => ({
    type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
});
const collection = (...geometries: Polygon[]): FeatureCollection => ({
    type: 'FeatureCollection', features: geometries.map((geometry) => ({ type: 'Feature', properties: {}, geometry })),
});

describe('FlatMapRenderPath.fitBounds', () => {
    // With a 90 degree field of view the tangent of half of it is 1, so a distance d shows 2d down and 2d across on a
    // square canvas: the numbers below are exact.
    it('looks straight down at the middle of the rectangle', () => {
        const { path, camera } = flatPath(800, 800);
        path.fitBounds([100, 200, 300, 600]);
        const [up, lookAt, eye] = camera.resetCamera.mock.calls[0];
        expect(up).toEqual([0, 1, 0]);
        expect(lookAt).toEqual([200, 400, 0]);
        expect([eye[0], eye[1]]).toEqual([200, 400]);
    });

    it('is as high as the height needs when the rectangle is tall', () => {
        const { path, camera } = flatPath(800, 800);
        path.fitBounds([0, 0, 1000, 4000]); // needs 4000 / 2 = 2000, against 500 for the width
        expect(camera.resetCamera.mock.calls[0][2][2]).toBeCloseTo(2000 * 1.08, 6);
    });

    it('is as high as the width needs when the rectangle is wide', () => {
        const { path, camera } = flatPath(800, 800);
        path.fitBounds([0, 0, 6000, 1000]); // needs 6000 / 2 = 3000, against 500 for the height
        expect(camera.resetCamera.mock.calls[0][2][2]).toBeCloseTo(3000 * 1.08, 6);
    });

    it('needs less height on a canvas that is wider than tall', () => {
        const square_ = flatPath(800, 800);
        const wide = flatPath(1600, 800);
        square_.path.fitBounds([0, 0, 6000, 1000]);
        wide.path.fitBounds([0, 0, 6000, 1000]);
        expect(wide.camera.resetCamera.mock.calls[0][2][2]).toBeCloseTo(square_.camera.resetCamera.mock.calls[0][2][2] / 2, 6);
    });

    it('resizes the camera to the canvas, and survives a rectangle with no extent', () => {
        const { path, camera } = flatPath(640, 480);
        path.fitBounds([5, 5, 5, 5]);
        expect(camera.resize).toHaveBeenCalledWith(640, 480);
        expect(Number.isFinite(camera.resetCamera.mock.calls[0][2][2])).toBe(true);
    });
});

describe('FlatMapRenderPath.resetCamera', () => {
    it('returns to the default view when nothing was fitted', () => {
        const { path, camera } = flatPath(800, 800);
        path.resetCamera();
        expect(camera.resetCamera).toHaveBeenCalledWith([0, 1, 0], [0, 0, 0], [0, 0, 10000]);
    });

    it('returns to the fitted view once a rectangle was fitted, not to the default', () => {
        const { path, camera } = flatPath(800, 800);
        path.fitBounds([0, 0, 6000, 1000]);
        const fitted = camera.resetCamera.mock.calls[0];
        camera.resetCamera.mockClear();
        path.resetCamera();
        expect(camera.resetCamera).toHaveBeenCalledTimes(1);
        expect(camera.resetCamera.mock.calls[0]).toEqual(fitted);
    });

    it('fits again for the canvas as it is when reset, so a resized canvas is framed correctly', () => {
        const camera = { getFovyRadians: () => Math.PI / 2, resetCamera: vi.fn(), resize: vi.fn() };
        const renderer = { pixelWidth: 800, pixelHeight: 800 };
        const path = new FlatMapRenderPath(renderer as never, camera as never, {} as never, {} as never);
        path.fitBounds([0, 0, 6000, 1000]);
        const square = camera.resetCamera.mock.calls[0][2][2];
        renderer.pixelWidth = 1600;                                    // the window was made wider
        path.resetCamera();
        expect(camera.resetCamera.mock.calls[1][2][2]).toBeCloseTo(square / 2, 6);
    });
});

describe('fitted ground clipping with the real map camera', () => {
    function realPath(width: number, height: number) {
        const camera = new MapCamera(vi.fn());
        const renderer = { pixelWidth: width, pixelHeight: height };
        const path = new FlatMapRenderPath(renderer as never, camera, {} as never, {} as never);
        return { camera, renderer, path };
    }

    function expectVisible(camera: MapCamera, bounds: [number, number, number, number]) {
        for (const x of [bounds[0], bounds[2]]) {
            for (const y of [bounds[1], bounds[3]]) {
                const clip = vec4.transformMat4(vec4.create(), [x, y, 0, 1], camera.getViewProjectionMatrix());
                expect(clip[3]).toBeGreaterThan(0);
                expect(Math.abs(clip[0] / clip[3])).toBeLessThanOrEqual(1);
                expect(Math.abs(clip[1] / clip[3])).toBeLessThanOrEqual(1);
                expect(clip[2] / clip[3]).toBeGreaterThan(0);
                expect(clip[2] / clip[3]).toBeLessThan(1);
            }
        }
    }

    it.each([
        { width: 800, height: 800, bounds: [-200000, -200000, 200000, 200000] },
        { width: 100, height: 800, bounds: [-50000, -500, 50000, 500] },
    ])('keeps ground visible for bounds $bounds on a $width by $height canvas', ({ width, height, bounds }) => {
        const { camera, path } = realPath(width, height);
        path.fitBounds(bounds as [number, number, number, number]);
        expect(camera.getFar()).toBeGreaterThan(500_000);
        expect(camera.getFar()).toBeCloseTo(camera.getEye()[2] * 1.1, 0);
        expectVisible(camera, bounds as [number, number, number, number]);
    });

    it('recalculates the clipping range when a fitted view is reset after narrowing the canvas', () => {
        const { camera, renderer, path } = realPath(800, 800);
        const bounds: [number, number, number, number] = [-50000, -500, 50000, 500];
        path.fitBounds(bounds);
        expect(camera.getFar()).toBe(500_000);
        renderer.pixelWidth = 100;
        path.resetCamera();
        expect(camera.getFar()).toBeGreaterThan(500_000);
        expectVisible(camera, bounds);
    });

    it('restores the default far plane for smaller fits and ordinary camera resets', () => {
        const { camera, path } = realPath(800, 800);
        path.fitBounds([-200000, -200000, 200000, 200000]);
        path.fitBounds([-500, -500, 500, 500]);
        expect(camera.getFar()).toBe(500_000);
        expectVisible(camera, [-500, -500, 500, 500]);
        camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 10000]);
        expect(camera.getFar()).toBe(500_000);
    });
});

describe('LayerManager bounds', () => {
    it('keeps the bounds of the collection that set the origin, and the origin as before', () => {
        const manager = new LayerManager();
        expect(manager.bounds).toBeUndefined();
        manager.initializeOrigin(collection(square(10, 20, 30, 60)));
        expect(manager.bounds).toEqual([10, 20, 30, 60]);
        expect(manager.origin).toEqual([20, 40]);
    });

    it('has no bounds for a collection without coordinates', () => {
        const manager = new LayerManager();
        manager.initializeOrigin({ type: 'FeatureCollection', features: [] });
        expect(manager.bounds).toBeUndefined();
    });
});

describe('AutkMap.fitBounds', () => {
    function map(options: { origin?: number[]; bounds?: number[]; terrain?: boolean } = {}) {
        const instance = Object.create(AutkMap.prototype) as any;
        const fit = vi.fn();
        instance._flatRenderPath = { fitBounds: fit };
        instance._terrainRenderPath = options.terrain ? {} : null;
        instance._layerManager = {
            hasOrigin: options.origin !== undefined,
            origin: options.origin,
            bounds: options.bounds,
        };
        instance.requestRender = vi.fn();
        return { instance, fit };
    }

    it('frames the first collection, relative to the map origin, and asks for a frame', () => {
        const { instance, fit } = map({ origin: [20, 40], bounds: [10, 20, 30, 60] });
        instance.fitBounds();
        expect(fit).toHaveBeenCalledWith([-10, -20, 10, 20]);
        expect(instance.requestRender).toHaveBeenCalledTimes(1);
    });

    it('frames the rectangle it is given, in the coordinates of the data', () => {
        const { instance, fit } = map({ origin: [100, 100], bounds: [0, 0, 1, 1] });
        instance.fitBounds([90, 95, 130, 105]);
        expect(fit).toHaveBeenCalledWith([-10, -5, 30, 5]);
    });

    it('does nothing before a layer is loaded, without bounds, or in terrain mode', () => {
        for (const options of [{}, { origin: [0, 0] }, { origin: [0, 0], bounds: [0, 0, 1, 1], terrain: true }]) {
            const { instance, fit } = map(options);
            expect(() => instance.fitBounds()).not.toThrow();
            expect(fit).not.toHaveBeenCalled();
            expect(instance.requestRender).not.toHaveBeenCalled();
        }
    });
});
