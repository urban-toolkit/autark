import { describe, expect, it } from 'vitest';
import { vec4 } from 'gl-matrix';
import { Camera } from '../src/camera';

/** A camera at `height` looking straight down at the origin. */
function cameraAt(height: number): Camera {
    const camera = new Camera({ eye: [0, 0, height], lookAt: [0, 0, 0], up: [0, 1, 0] });
    camera.resize(1000, 800);
    camera.update();
    return camera;
}

/** Depth of the ground point under the camera, as the projection gives it: reversed-Z, so 1 at the near plane, 0 at the far plane. */
function groundDepth(camera: Camera): number {
    const clip = vec4.fromValues(0, 0, 0, 1);
    vec4.transformMat4(clip, clip, camera.getViewProjectionMatrix());
    return clip[2] / clip[3];
}

describe('Camera far plane', () => {
    it('keeps the 500 km floor for a camera that is low', () => {
        expect(cameraAt(10_000).getFar()).toBe(5e5);
    });

    it('keeps the ground inside the view however high the camera is', () => {
        for (const height of [1e5, 4e5, 6e5, 2e6, 1e7]) {
            const depth = groundDepth(cameraAt(height));
            expect(depth, `height ${height}`).toBeGreaterThan(0);        // 0 or less: beyond the far plane, clipped
            expect(depth, `height ${height}`).toBeLessThan(1);
        }
    });

    it('lets the far plane grow with the height and shrink back', () => {
        const camera = cameraAt(2e6);
        expect(camera.getFar()).toBeGreaterThan(2e6);
        camera.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 1000]);
        camera.update();
        expect(camera.getFar()).toBe(5e5);
    });
});
