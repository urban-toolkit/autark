import { describe, expect, it } from 'vitest';
import { vec4 } from 'gl-matrix';
import { Camera } from '../src/camera';

const cases = (['perspective', 'orthographic'] as const).flatMap(projection =>
    [0, Math.PI / 3].map(tilt => ({ projection, tilt })));

describe('adaptive camera depth range', () => {
    it.each(cases)('keeps ground visible through zoom-out in $projection at tilt $tilt', ({ projection, tilt }) => {
        const camera = new Camera();
        camera.resize(800, 600);
        camera.resetCamera([0, Math.cos(tilt), Math.sin(tilt)], [0, 0, 0],
            [0, -100_000 * Math.tan(tilt), 100_000]);
        camera.setProjection(projection);
        camera.update();
        const initialFar = camera.getFar();

        for (let step = 0; step < 30; step++) {
            camera.zoom(1, 0.5, 0.5);
            camera.update();
        }
        expect(camera.getEye()[2]).toBeGreaterThan(500_000);
        const clip = vec4.transformMat4(vec4.create(), [0, 0, 0, 1], camera.getViewProjectionMatrix());
        expect(clip[2] / clip[3]).toBeGreaterThan(0);
        expect(clip[2] / clip[3]).toBeLessThan(1);
        expect(camera.getFar()).toBeGreaterThan(initialFar);
        expect(camera.getFar()).toBeGreaterThan(camera.getEye()[2]);
        const edge = vec4.transformMat4(vec4.create(), [0, 0, -camera.getFar(), 1], camera.getProjectionMatrix());
        expect(edge[2] / edge[3]).toBeCloseTo(0, 6);
        expect(camera.saveState().far).toBe(500_000);
        if (projection === 'orthographic') {
            expect(camera.saveState().framingDistance).toBeGreaterThan(500_000);
            expect(camera.getProjectionMatrix()[5]).toBeLessThan(1 / (500_000 * Math.tan(camera.getFovyRadians() / 2)));
        }

        camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 1000]);
        camera.update();
        expect(camera.getFar()).toBe(500_000);
    });

    it.each(['perspective', 'orthographic'] as const)('keeps the far edge of the gallery tilt view visible in %s', projection => {
        const camera = new Camera();
        camera.resize(1120, 640);
        const tilt = 1;
        const height = 1_000_000;
        camera.resetCamera([0, Math.cos(tilt), Math.sin(tilt)], [0, 0, 0], [0, -height * Math.tan(tilt), height]);
        camera.setProjection(projection);
        camera.update();

        for (const x of [0.01, 0.5, 0.99]) {
            const [gx, gy] = camera.getGroundPoint(x, 0.99, 20 * height);
            const clip = vec4.transformMat4(vec4.create(), [gx, gy, 0, 1], camera.getViewProjectionMatrix());
            expect(clip[1] / clip[3]).toBeCloseTo(0.98, 4);
            expect(clip[2] / clip[3]).toBeGreaterThan(0);
            expect(clip[2] / clip[3]).toBeLessThan(1);
        }
    });

    it('keeps the fixed-bounds terrain overlay projection unchanged', () => {
        const camera = new Camera();
        camera.resize(800, 600);
        camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 2_000_000]);
        camera.update();
        expect(camera.getFar()).toBeGreaterThan(500_000);
        camera.setOrthographicBounds(-10, 10, -20, 20);
        const overlay = new Camera();
        overlay.setOrthographicBounds(-10, 10, -20, 20);
        camera.update();
        expect(camera.getProjectionMatrix()).toEqual(overlay.getProjectionMatrix());
        expect(camera.getFar()).toBe(500_000);
    });
});
