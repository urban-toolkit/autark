import { describe, expect, it } from 'vitest';
import { Camera } from '../src/camera';

const projections = ['perspective', 'orthographic'] as const;

describe('camera snapshots', () => {
    it.each(projections)('restores a navigated %s view into a camera in the other mode', (projection) => {
        const source = new Camera();
        source.resize(800, 600);
        source.resetCamera([0, 1, 0], [100, 200, 80], [100, 200, 1200], 20_000, 0.5);
        source.setProjection(projection);
        source.pitch(-0.6);
        source.translate(0.12, -0.08);
        source.zoom(-0.7, 0.3, 0.75);
        source.update();

        const restored = new Camera();
        restored.resize(800, 600);
        restored.setProjection(projection === 'perspective' ? 'orthographic' : 'perspective');
        restored.restoreState(JSON.parse(JSON.stringify(source.saveState())));

        expect(restored.getProjection()).toBe(projection);
        expect(restored.getNear()).toBe(0.5);
        expect(restored.getFar()).toBe(20_000);
        expect(restored.getViewProjectionMatrix()).toEqual(source.getViewProjectionMatrix());
        expect(restored.getGroundPoint(0.3, 0.75, 10_000)).toEqual(source.getGroundPoint(0.3, 0.75, 10_000));

        // A perspective snapshot also preserves the scale a later switch to orthographic uses.
        source.setProjection('orthographic');
        restored.setProjection('orthographic');
        expect(restored.getViewProjectionMatrix()).toEqual(source.getViewProjectionMatrix());
    });

    it.each(projections)('restores fixed bounds and the %s mode that follows a reset', (projection) => {
        const source = new Camera();
        source.resize(800, 600);
        source.setProjection(projection);
        source.setOrthographicBounds(-10, 900, -200, 300);

        const restored = new Camera();
        restored.resize(400, 300);
        restored.restoreState(source.saveState());
        expect(restored.getProjection()).toBe('orthographic');
        expect(restored.getViewportWidth()).toBe(400);
        expect(restored.getViewProjectionMatrix()).toEqual(source.getViewProjectionMatrix());

        restored.resetCamera([0, 1, 0], [0, 0, 0], [0, 0, 100]);
        expect(restored.getProjection()).toBe(projection);
    });
});
