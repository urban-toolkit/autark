import { describe, expect, it, vi } from 'vitest';
import { MouseEvents } from '../src/events-mouse';

/**
 * A canvas whose CSS size is 200 x 100 drawn on screen at `scale` (an app zooming a panel with
 * `transform: scale()`), at (10, 20) in the viewport.
 */
function setup(scale: number) {
    const canvas = {
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 200 * scale, height: 100 * scale }),
        style: { setProperty: vi.fn(), getPropertyValue: () => '' },
    };
    const layer = { layerRenderInfo: { isPick: true, isSkip: false } as Record<string, unknown> };
    const map = {
        renderer: { canvas, cssWidth: 200, cssHeight: 100 },
        activePickingLayer: layer,
        requestRender: vi.fn(),
        clearHover: vi.fn(),
        camera: { translate: vi.fn(), yaw: vi.fn(), pitch: vi.fn(), zoom: vi.fn() },
    };
    const mouse = new MouseEvents(map as never);
    // The canvas centre on screen, wherever the transform puts it
    const centre = { clientX: 10 + 100 * scale, clientY: 20 + 50 * scale };
    const quiet = { preventDefault: () => {}, stopPropagation: () => {} };
    return { mouse, map, layer, centre, quiet, canvas };
}

describe('pointer positions on a canvas drawn under a CSS transform', () => {
    for (const scale of [0.5, 1, 2]) {
        it(`zooms at the pointer at scale ${scale}`, () => {
            const { mouse, map, centre, quiet } = setup(scale);
            mouse.mouseWheel({ ...quiet, ...centre, deltaY: 100 } as never);
            const [, x, y] = map.camera.zoom.mock.calls[0];
            expect(x).toBeCloseTo(0.5);
            expect(y).toBeCloseTo(0.5);
        });

        it(`picks at the pointer on double click at scale ${scale}`, () => {
            const { mouse, layer, centre, quiet } = setup(scale);
            mouse.mouseDoubleClick({ ...quiet, ...centre } as never);
            expect(layer.layerRenderInfo.pickedComps).toEqual([100, 50]);
        });
    }
});
