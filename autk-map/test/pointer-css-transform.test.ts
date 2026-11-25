import { describe, expect, it, vi } from 'vitest';
import { MouseEvents } from '../src/events-mouse';

function setup(scale: number) {
    // A 200 × 100 canvas under a scaled, translated ancestor.
    const canvas = {
        focus: vi.fn(),
        getBoundingClientRect: () => ({ left: 110, top: 70, width: 200 * scale, height: 100 * scale }),
    };
    const layerRenderInfo = { isClick: true, pickedComps: undefined as number[] | undefined };
    const map = {
        canvas,
        renderer: { canvas, cssWidth: 200, cssHeight: 100 },
        activeClickLayer: { layerRenderInfo },
        camera: { zoom: vi.fn(), translate: vi.fn() },
        requestPickingFrame: vi.fn(),
    };
    const mouse = new MouseEvents(map as never);
    const event = {
        target: canvas, button: 0, buttons: 1, pointerType: 'mouse',
        clientX: 110 + 40 * scale, clientY: 70 + 30 * scale,
        preventDefault: vi.fn(), stopPropagation: vi.fn(),
    };
    return { mouse, map, event, layerRenderInfo };
}

describe.each([0.5, 1, 2])('pointer coordinates at CSS scale %s', (scale) => {
    it('anchors wheel zoom at an off-center pointer', () => {
        const { mouse, map, event } = setup(scale);
        mouse.mouseWheel({ ...event, deltaY: 100 } as unknown as WheelEvent);
        expect(map.camera.zoom).toHaveBeenCalledWith(1, 0.2, 0.7);
    });

    it('picks at the same canvas-local CSS position on double click', () => {
        const { mouse, event, layerRenderInfo } = setup(scale);
        mouse.mouseDoubleClick(event as unknown as MouseEvent);
        expect(layerRenderInfo.pickedComps).toEqual([40, 30]);
    });

    it('pans by the same fraction of the canvas for the same local drag', () => {
        const { mouse, map, event } = setup(scale);
        mouse.pointerDown(event as unknown as PointerEvent);
        mouse.pointerMove({ ...event, clientX: event.clientX + 20 * scale, clientY: event.clientY + 10 * scale } as unknown as PointerEvent);
        expect(map.camera.translate).toHaveBeenCalledWith(-0.1, 0.1);
    });
});
