import { EventEmitter } from '@urban-toolkit/autk-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutkMap } from '../src/map';
import { AutkMapUi } from '../src/map-ui';
import { MapEvent } from '../src/types-events';
import type { MapEventRecord } from '../src/types-events';

/** A map without a GPU: the layers it knows, the hover switch and the tooltip UI are stubs that record their calls. */
function mapWith(layers: Record<string, object> = { parks: { layerRenderInfo: {}, updateLayerRenderInfo: vi.fn(), clearHighlightedIds: vi.fn() } }) {
    const map = Object.create(AutkMap.prototype) as any;
    map._mapEvents = new EventEmitter<MapEventRecord>();
    map._layerManager = { searchByLayerId: (id: string) => layers[id] ?? null, layers: Object.values(layers) };
    map._mouseEvents = { setHoverEnabled: vi.fn() };
    map._ui = { showTooltip: vi.fn(), hideTooltip: vi.fn(), refreshLegend: vi.fn(), refreshLayerList: vi.fn(), reconcileActiveLayer: vi.fn() };
    map.updateRenderInfo = vi.fn();
    const hover = (data: Partial<{ layerId: string; id: number | null; x: number; y: number }>) =>
        map._mapEvents.emit(MapEvent.HOVER, { layerId: 'parks', id: 3, x: 40, y: 50, ...data });
    return { map, hover, ui: map._ui, layers };
}

describe('AutkMap.setTooltip', () => {
    afterEach(() => vi.restoreAllMocks());

    it('turns picking and hover on for the layer, and shows what the provider returns at the pointer', () => {
        const { map, hover, ui } = mapWith();
        const provider = vi.fn((id: number) => `park ${id}`);
        map.setTooltip('parks', provider);
        expect(map.updateRenderInfo).toHaveBeenCalledWith('parks', { isPick: true });
        expect(map._mouseEvents.setHoverEnabled).toHaveBeenCalledWith(true);
        hover({ id: 3, x: 40, y: 50 });
        expect(provider).toHaveBeenCalledWith(3);
        expect(ui.showTooltip).toHaveBeenCalledWith('park 3', 40, 50);
    });

    it('hides the tooltip when nothing is under the pointer, for no content, and for another layer', () => {
        const { map, hover, ui } = mapWith();
        map.setTooltip('parks', (id: number) => (id === 1 ? null : id === 2 ? '' : 'x'));
        hover({ id: null });
        hover({ id: 1 });
        hover({ id: 2 });
        hover({ id: 3, layerId: 'roads' });
        expect(ui.showTooltip).not.toHaveBeenCalled();
        expect(ui.hideTooltip).toHaveBeenCalledTimes(4);
    });

    it('shows an element as it is, and logs and hides when the provider throws', () => {
        const { map, hover, ui } = mapWith();
        const element = { tag: 'element' };
        map.setTooltip('parks', (id: number) => {
            if (id === 9) throw new Error('boom');
            return element as never;
        });
        hover({ id: 1 });
        expect(ui.showTooltip).toHaveBeenCalledWith(element, 40, 50);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        hover({ id: 9 });
        expect(String(error.mock.calls[0][0])).toContain('Tooltip of layer "parks": boom');
        expect(ui.hideTooltip).toHaveBeenCalledTimes(1);
    });

    it('registers one listener however often it is set, and the latest provider wins', () => {
        const { map, hover, ui } = mapWith();
        map.setTooltip('parks', () => 'first');
        map.setTooltip('parks', () => 'second');
        hover({ id: 1 });
        expect(ui.showTooltip).toHaveBeenCalledTimes(1);
        expect(ui.showTooltip).toHaveBeenCalledWith('second', 40, 50);
    });

    it('is removed with null: hover stops, the tooltip hides and the provider is not asked again', () => {
        const { map, hover, ui } = mapWith();
        const provider = vi.fn(() => 'x');
        map.setTooltip('parks', provider);
        map.setTooltip('parks', null);
        expect(map._mouseEvents.setHoverEnabled).toHaveBeenLastCalledWith(false);
        expect(ui.hideTooltip).toHaveBeenCalled();
        hover({ id: 1 });
        expect(provider).not.toHaveBeenCalled();
    });

    it('ignores a layer that does not exist', () => {
        const { map } = mapWith();
        map.setTooltip('missing', () => 'x');
        expect(map.updateRenderInfo).not.toHaveBeenCalled();
        expect(map._mouseEvents.setHoverEnabled).not.toHaveBeenCalled();
    });
});

describe('a tooltip and a layer that is hidden', () => {
    it('hides when the tooltip layer is hidden, and not for another layer', () => {
        const parks = { layerInfo: { typeLayer: 'polygons' }, layerRenderInfo: {}, updateLayerRenderInfo: vi.fn(), clearHighlightedIds: vi.fn() };
        const roads = { layerInfo: { typeLayer: 'lines' }, layerRenderInfo: {}, updateLayerRenderInfo: vi.fn(), clearHighlightedIds: vi.fn() };
        const { map, ui } = mapWith({ parks, roads });
        map._tooltip = { layerId: 'parks', provider: () => 'x' };
        // updateRenderInfo is the real method here
        map.updateRenderInfo = AutkMap.prototype.updateRenderInfo;
        map.updateRenderInfo('roads', { isSkip: true });
        expect(ui.hideTooltip).not.toHaveBeenCalled();
        map.updateRenderInfo('parks', { opacity: 0.5 });
        expect(ui.hideTooltip).not.toHaveBeenCalled();
        map.updateRenderInfo('parks', { isSkip: true });
        expect(ui.hideTooltip).toHaveBeenCalledTimes(1);
    });
});

/** The few things of an element that the tooltip code uses. */
function fakeElement() {
    const element: any = { style: {} as Record<string, string>, id: '', textContent: '', offsetWidth: 120, offsetHeight: 40,
        children: [] as unknown[], remove: vi.fn(), appendChild: vi.fn() };
    element.replaceChildren = vi.fn((child: unknown) => { element.children = [child]; });
    return element;
}

describe('the tooltip element', () => {
    const created: any[] = [];

    function ui(canvasOverrides: Record<string, unknown> = {}) {
        const parent = fakeElement();
        const canvas = { offsetLeft: 5, offsetTop: 7, clientWidth: 400, clientHeight: 300, parentElement: parent, ...canvasOverrides };
        return { ui: new AutkMapUi({ canvas } as never), parent, tooltip: () => created[created.length - 1] };
    }

    beforeEach(() => {
        created.length = 0;
        vi.stubGlobal('document', { createElement: vi.fn(() => { const el = fakeElement(); created.push(el); return el; }) });
    });
    afterEach(() => vi.unstubAllGlobals());

    it('is created on first use, next to the canvas, and never takes pointer events', () => {
        const { ui: u, parent, tooltip } = ui();
        expect(created).toHaveLength(0);                 // nothing before it is needed
        u.showTooltip('Informal Early', 100, 80);
        expect(created).toHaveLength(1);
        expect(parent.appendChild).toHaveBeenCalledWith(tooltip());
        expect(tooltip().style.pointerEvents).toBe('none');
        expect(tooltip().id).toBe('autkMapTooltip');
        u.showTooltip('again', 110, 90);
        expect(created).toHaveLength(1);                 // reused
    });

    it('shows a string as text, never as HTML, and an element as it is', () => {
        const { ui: u, tooltip } = ui();
        u.showTooltip('<img src=x onerror=alert(1)>', 10, 10);
        expect(tooltip().textContent).toBe('<img src=x onerror=alert(1)>');
        expect(tooltip().replaceChildren).not.toHaveBeenCalled();
        const rows = fakeElement();
        u.showTooltip(rows, 10, 10);
        expect(tooltip().replaceChildren).toHaveBeenCalledWith(rows);
        expect(tooltip().style.display).toBe('block');
    });

    it('sits to the lower right of the pointer, in the canvas position', () => {
        const { ui: u, tooltip } = ui();
        u.showTooltip('x', 100, 80);
        expect(tooltip().style.left).toBe(`${5 + 100 + 14}px`);
        expect(tooltip().style.top).toBe(`${7 + 80 + 14}px`);
    });

    it('flips to the other side of the pointer where it would leave the canvas', () => {
        const { ui: u, tooltip } = ui();
        u.showTooltip('x', 350, 100);                    // 350 + 14 + 120 > 400
        expect(tooltip().style.left).toBe(`${5 + 350 - 14 - 120}px`);
        u.showTooltip('x', 100, 280);                    // 280 + 14 + 40 > 300
        expect(tooltip().style.top).toBe(`${7 + 280 - 14 - 40}px`);
    });

    it('never goes outside the canvas to the left or top', () => {
        const { ui: u, tooltip } = ui({ clientWidth: 100, clientHeight: 60 });
        u.showTooltip('x', 10, 10);                      // too wide and tall to fit either side
        expect(parseFloat(tooltip().style.left)).toBeGreaterThanOrEqual(5);
        expect(parseFloat(tooltip().style.top)).toBeGreaterThanOrEqual(7);
    });

    it('hides, shows again, and is removed with the UI; hiding before it exists is harmless', () => {
        const { ui: u, tooltip } = ui();
        expect(() => u.hideTooltip()).not.toThrow();
        u.showTooltip('x', 10, 10);
        u.hideTooltip();
        expect(tooltip().style.display).toBe('none');
        u.showTooltip('y', 10, 10);
        expect(tooltip().style.display).toBe('block');
        u.destroy();
        expect(tooltip().remove).toHaveBeenCalled();
    });

    it('does nothing while the canvas has no parent', () => {
        const { ui: u } = ui({ parentElement: null });
        u.showTooltip('x', 10, 10);
        expect(created).toHaveLength(0);
    });
});
