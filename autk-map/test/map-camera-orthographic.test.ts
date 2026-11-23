import { describe, expect, it, vi } from 'vitest';
import { vec4 } from 'gl-matrix';
import { AutkMap } from '../src/map';
import { FlatMapRenderPath } from '../src/map-flat';
import { MapCamera } from '../src/map-camera';

/** A flat render path over a real map camera, on an 800 by 600 canvas. */
function flatPath() {
    const onChange = vi.fn();
    const camera = new MapCamera(onChange);
    const path = new FlatMapRenderPath({ pixelWidth: 800, pixelHeight: 600 } as never, camera, {} as never, {} as never);
    return { camera, path, onChange };
}

/** Checks that the camera draws orthographically, with the rectangle's corners and a point 300 m over its middle in view. */
function expectOrthographicFrame(camera: MapCamera, [minX, minY, maxX, maxY]: [number, number, number, number]) {
    const projection = camera.getProjectionMatrix();
    expect([projection[3], projection[7], projection[11], projection[15]]).toEqual([0, 0, 0, 1]);
    for (const [px, py, pz] of [[minX, minY, 0], [maxX, maxY, 0], [(minX + maxX) / 2, (minY + maxY) / 2, 300]]) {
        const clip = vec4.transformMat4(vec4.create(), [px, py, pz, 1], camera.getViewProjectionMatrix());
        expect(Math.abs(clip[0] / clip[3])).toBeLessThanOrEqual(1);
        expect(Math.abs(clip[1] / clip[3])).toBeLessThanOrEqual(1);
        expect(clip[2] / clip[3]).toBeGreaterThan(0);
        expect(clip[2] / clip[3]).toBeLessThan(1);
    }
}

describe('map camera zoom clearance', () => {
    it.each(['perspective', 'orthographic'] as const)('stops an off-center %s zoom above the loaded peak', projection => {
        let maxHeight = 300;
        const camera = new MapCamera(vi.fn(), () => maxHeight);
        camera.resize(800, 600);
        camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 1000]);
        camera.setProjection(projection);
        camera.zoom(-10, 0.75, 0.5);
        camera.update();
        expect(camera.getEye()[2]).toBeCloseTo(301, 4);
        expect(camera.getEye()[0]).toBeGreaterThan(0);
        const stopped = camera.getEye();
        camera.zoom(-1, 0.75, 0.5);
        expect(camera.getEye()).toEqual(stopped);
        camera.zoom(2, 0.75, 0.5);
        expect(camera.getEye()[2]).toBeGreaterThan(301);
        maxHeight = 0;
        camera.zoom(-10, 0.5, 0.5);
        expect(camera.getEye()[2]).toBeCloseTo(1, 4);
    });

    it('keeps the peak visible with the perspective near plane at the zoom floor', () => {
        const camera = new MapCamera(vi.fn(), () => 300);
        camera.resize(800, 600);
        camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 1000]);
        camera.zoom(-10, 0.5, 0.5);
        camera.update();
        const clip = vec4.transformMat4(vec4.create(), [0, 0, 300, 1], camera.getViewProjectionMatrix());
        expect(clip[2] / clip[3]).toBeGreaterThan(0);
        expect(clip[2] / clip[3]).toBeLessThan(1);
        expect(camera.getNear()).toBeLessThan(1);
        expect(camera.saveState().near).toBe(1);
    });
});

describe('an orthographic map camera', () => {
    it('reports the switch, so a map drawn on demand draws it', () => {
        const { camera, onChange } = flatPath();
        onChange.mockClear();
        camera.setProjection('orthographic');
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('reports a restored view once for on-demand rendering', () => {
        const { camera, onChange } = flatPath();
        camera.resize(800, 600);
        camera.setProjection('orthographic');
        camera.setOrthographicBounds(-10, 900, -200, 300);
        const state = camera.saveState();
        camera.setProjection('perspective');
        onChange.mockClear();

        camera.restoreState(state);

        expect(camera.getProjection()).toBe('orthographic');
        expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('stays orthographic when a host fits the map and when the map resets its camera, as its R key does', () => {
        const { camera, path } = flatPath();
        camera.setProjection('orthographic');
        const bounds: [number, number, number, number] = [-5000, -3000, 5000, 3000];
        path.fitBounds(bounds);
        camera.update(); // as each frame does
        expectOrthographicFrame(camera, bounds);

        camera.zoom(-3, 0.5, 0.5);
        camera.update();
        const map = Object.create(AutkMap.prototype) as any;
        map._terrainRenderPath = null;
        map._flatRenderPath = path;
        map.resetCamera();
        camera.update();
        expectOrthographicFrame(camera, bounds);
    });
});
