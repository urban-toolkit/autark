import { EventEmitter } from '@urban-toolkit/autk-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MouseEvents } from '../src/events-mouse';
import { AutkMap } from '../src/map';
import { MapPickingController } from '../src/map-picking';
import { VectorLayer } from '../src/layer-vector';
import { MapEvent } from '../src/types-events';
import type { HoverEventData, MapEventData, MapEventRecord } from '../src/types-events';

/** A vector layer with picking on, as far as the picking controller looks at it, without a GPU. */
function pickLayer(info: Record<string, unknown> = {}) {
    const layer = Object.create(VectorLayer.prototype) as any;
    const define = (name: string, value: unknown) => Object.defineProperty(layer, name, { value, writable: true });
    define('layerRenderInfo', { isPick: true, isSkip: false, ...info });
    define('layerInfo', { id: 'parks' });
    define('highlightedIds', []);
    layer.toggleHighlightedIds = vi.fn();
    layer.clearHighlightedIds = vi.fn();
    return layer;
}

function controller(layer: unknown, options: { slot?: number | null; id?: number } = {}) {
    const events = new EventEmitter<MapEventRecord>();
    const hovers: HoverEventData[] = [];
    const picks: MapEventData[] = [];
    events.on(MapEvent.HOVER, (data) => hovers.push(data));
    events.on(MapEvent.PICKING, (data) => picks.push(data));
    const renderer = {
        reservePickingReadbackSlot: vi.fn(() => (options.slot === undefined ? 0 : options.slot)),
        enqueuePickingReadback: vi.fn(),
        readPickingResults: vi.fn(async () => [options.id ?? 7]),
    };
    const picking = new MapPickingController(renderer as never, { layers: [layer] } as never, events);
    return { picking, renderer, hovers, picks };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a hover read through the picking controller', () => {
    afterEach(() => vi.restoreAllMocks());

    it('reports the feature under the pointer and leaves the highlight alone', async () => {
        const layer = pickLayer({ hoverComps: [30, 40] });
        const { picking, hovers, picks } = controller(layer, { id: 7 });
        const pending = picking.consumePendingPick();
        expect(pending).toMatchObject({ kind: 'hover', x: 30, y: 40 });
        picking.resolvePickingReadback(pending, picking.enqueuePickingReadback(pending!));
        await settle();
        expect(hovers).toEqual([{ layerId: 'parks', id: 7, x: 30, y: 40 }]);
        expect(picks).toEqual([]);
        expect(layer.toggleHighlightedIds).not.toHaveBeenCalled();
        expect(layer.clearHighlightedIds).not.toHaveBeenCalled();
    });

    it('reports null when nothing is under the pointer, and still does not clear the highlight', async () => {
        const layer = pickLayer({ hoverComps: [1, 2] });
        const { picking, hovers } = controller(layer, { id: -1 });
        const pending = picking.consumePendingPick();
        picking.resolvePickingReadback(pending, picking.enqueuePickingReadback(pending!));
        await settle();
        expect(hovers).toEqual([{ layerId: 'parks', id: null, x: 1, y: 2 }]);
        expect(layer.clearHighlightedIds).not.toHaveBeenCalled();
    });

    it('is consumed once, and a select that is waiting goes first and takes the hover with it', () => {
        const layer = pickLayer({ pickedComps: [5, 6], hoverComps: [30, 40] });
        const { picking } = controller(layer);
        expect(picking.consumePendingPick()).toMatchObject({ kind: 'select', x: 5, y: 6 });
        expect(layer.layerRenderInfo.pickedComps).toBeUndefined();
        expect(layer.layerRenderInfo.hoverComps).toBeUndefined();
        expect(picking.consumePendingPick()).toBeNull();
    });

    it('does nothing for a layer that is hidden or not pickable, and does not touch its highlight', () => {
        const hidden = pickLayer({ hoverComps: [1, 1], isSkip: true });
        expect(controller(hidden).picking.consumePendingPick()).toBeNull();
        const plain = { layerRenderInfo: { isPick: true, isSkip: false, hoverComps: [1, 1] }, clearHighlightedIds: vi.fn() };
        expect(controller(plain).picking.consumePendingPick()).toBeNull();
        expect(plain.clearHighlightedIds).not.toHaveBeenCalled();
        expect(plain.layerRenderInfo.hoverComps).toBeUndefined();
    });

    it('is quiet when the readback slots are busy, where a select still warns', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const hover = controller(pickLayer({ hoverComps: [1, 1] }), { slot: null });
        expect(hover.picking.enqueuePickingReadback(hover.picking.consumePendingPick()!)).toBeNull();
        expect(warn).not.toHaveBeenCalled();
        const select = controller(pickLayer({ pickedComps: [1, 1] }), { slot: null });
        select.picking.enqueuePickingReadback(select.picking.consumePendingPick()!);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('drops a result that arrives after the hover was invalidated', async () => {
        const layer = pickLayer({ hoverComps: [1, 1] });
        const { picking, hovers } = controller(layer);
        const pending = picking.consumePendingPick();
        const slot = picking.enqueuePickingReadback(pending!);
        picking.invalidateHover();                                   // the pointer left while the read was in flight
        picking.resolvePickingReadback(pending, slot);
        await settle();
        expect(hovers).toEqual([]);
    });

    it('still selects exactly as before', async () => {
        const layer = pickLayer({ pickedComps: [5, 6] });
        Object.defineProperty(layer, 'highlightedIds', { value: [7], writable: true });
        const { picking, hovers, picks } = controller(layer, { id: 7 });
        const pending = picking.consumePendingPick();
        picking.resolvePickingReadback(pending, picking.enqueuePickingReadback(pending!));
        await settle();
        expect(layer.toggleHighlightedIds).toHaveBeenCalledWith([7]);
        expect(picks).toEqual([{ selection: [7], layerId: 'parks' }]);
        expect(hovers).toEqual([]);
    });
});

describe('pointer tracking for hover', () => {
    const canvas = { getBoundingClientRect: () => ({ left: 10, top: 20 }), style: { setProperty: vi.fn(), getPropertyValue: () => '' } };

    function setup(options: { enabled?: boolean; layer?: unknown } = {}) {
        const layer = options.layer === undefined ? pickLayer() : options.layer;
        const map = {
            renderer: { canvas, cssWidth: 100, cssHeight: 100 },
            activePickingLayer: layer,
            requestRender: vi.fn(),
            clearHover: vi.fn(),
            camera: { translate: vi.fn(), yaw: vi.fn(), pitch: vi.fn(), zoom: vi.fn() },
        };
        const mouse = new MouseEvents(map as never);
        if (options.enabled !== false) mouse.setHoverEnabled(true);
        const move = (clientX: number, clientY: number, extra: Record<string, unknown> = {}) =>
            mouse.pointerMove({ pointerType: 'mouse', pointerId: 1, buttons: 0, target: canvas, clientX, clientY,
                preventDefault: () => {}, stopPropagation: () => {}, ...extra } as never);
        return { mouse, map, layer: layer as any, move };
    }

    beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] }));
    afterEach(() => vi.useRealTimers());

    it('reads nothing while hover is off', () => {
        const { map, layer, move } = setup({ enabled: false });
        move(50, 60);
        vi.advanceTimersByTime(1000);
        expect(layer.layerRenderInfo.hoverComps).toBeUndefined();
        expect(map.requestRender).not.toHaveBeenCalled();
    });

    it('reads the first move at once, at the pointer position relative to the canvas, and asks for a frame', () => {
        const { map, layer, move } = setup();
        move(50, 60);
        expect(layer.layerRenderInfo.hoverComps).toEqual([40, 40]);
        expect(map.requestRender).toHaveBeenCalledTimes(1);
    });

    it('leaves one trailing read for moves inside the interval, at the position the pointer stops at', () => {
        const { map, layer, move } = setup();
        move(50, 60);                                   // read at once
        layer.layerRenderInfo.hoverComps = undefined;   // as the next frame consumes it
        vi.advanceTimersByTime(30);
        move(70, 80);
        move(90, 100);
        expect(layer.layerRenderInfo.hoverComps).toBeUndefined();   // not yet: inside the interval
        vi.advanceTimersByTime(100);
        expect(layer.layerRenderInfo.hoverComps).toEqual([80, 80]); // the latest position, not the one in the middle
        expect(map.requestRender).toHaveBeenCalledTimes(2);
    });

    it('reads at most about ten times a second however fast the pointer moves', () => {
        const { map, move } = setup();
        for (let t = 0; t < 1000; t += 10) {
            move(10 + t / 10, 20);
            vi.advanceTimersByTime(10);
        }
        vi.advanceTimersByTime(200);
        expect(map.requestRender.mock.calls.length).toBeLessThanOrEqual(11);
        expect(map.requestRender.mock.calls.length).toBeGreaterThanOrEqual(8);
    });

    it('ends the hover when the pointer moves over something that is not the canvas, and cancels the waiting read', () => {
        const { map, layer, move } = setup();
        move(50, 60);
        layer.layerRenderInfo.hoverComps = undefined;
        move(55, 60);                                   // a trailing read is now waiting
        move(60, 60, { target: {} });                   // over the legend, say
        expect(map.clearHover).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(500);
        expect(layer.layerRenderInfo.hoverComps).toBeUndefined();
        move(60, 60, { target: {} });                   // still away: nothing more to report
        expect(map.clearHover).toHaveBeenCalledTimes(1);
    });

    it('ends the hover on leaving the canvas, on a wheel and on a drag, each once', () => {
        const { mouse, map, move } = setup();
        move(50, 60);
        (mouse as any)._onPointerLeave();
        expect(map.clearHover).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(200);
        move(50, 60);
        mouse.mouseWheel({ preventDefault: () => {}, stopPropagation: () => {}, clientX: 50, clientY: 60, deltaY: 1 } as never);
        expect(map.clearHover).toHaveBeenCalledTimes(2);
        mouse.mouseWheel({ preventDefault: () => {}, stopPropagation: () => {}, clientX: 50, clientY: 60, deltaY: 1 } as never);
        expect(map.clearHover).toHaveBeenCalledTimes(2);   // nothing was hovered since

        vi.advanceTimersByTime(200);
        move(50, 60);
        move(52, 62, { buttons: 1 });                      // a drag starts on the canvas
        expect(map.clearHover).toHaveBeenCalledTimes(3);
    });

    it('ignores touch, and does nothing without a pick layer', () => {
        const touch = setup();
        touch.move(50, 60, { pointerType: 'touch' });
        expect(touch.map.requestRender).not.toHaveBeenCalled();
        const none = setup({ layer: null });
        none.move(50, 60);
        expect(none.map.requestRender).not.toHaveBeenCalled();
    });

    it('turning hover off ends a hover in progress and stops reading', () => {
        const { mouse, map, layer, move } = setup();
        move(50, 60);
        layer.layerRenderInfo.hoverComps = undefined;
        mouse.setHoverEnabled(false);
        expect(map.clearHover).toHaveBeenCalledTimes(1);
        move(60, 60);
        vi.advanceTimersByTime(500);
        expect(layer.layerRenderInfo.hoverComps).toBeUndefined();
    });
});

describe('AutkMap hover methods', () => {
    it('setHover turns the pointer tracking on and off', () => {
        const map = Object.create(AutkMap.prototype) as any;
        map._mouseEvents = { setHoverEnabled: vi.fn() };
        map.setHover(true);
        map.setHover(false);
        expect(map._mouseEvents.setHoverEnabled.mock.calls).toEqual([[true], [false]]);
    });

    it('clearHover drops a read in flight and reports that nothing is hovered, naming the pick layer', () => {
        const map = Object.create(AutkMap.prototype) as any;
        map._picking = { invalidateHover: vi.fn() };
        map._mapEvents = new EventEmitter<MapEventRecord>();
        map._layerManager = { layers: [pickLayer()] };
        const heard: HoverEventData[] = [];
        map._mapEvents.on(MapEvent.HOVER, (data: HoverEventData) => heard.push(data));
        map.clearHover();
        expect(map._picking.invalidateHover).toHaveBeenCalledTimes(1);
        expect(heard).toEqual([{ layerId: 'parks', id: null, x: 0, y: 0 }]);
    });
});
