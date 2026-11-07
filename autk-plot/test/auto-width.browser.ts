/**
 * `width: 'auto'`: the plot fills the content width of its host and redraws
 * when it changes, keeping the selection, the painted parts and the
 * provenance path. jsdom has no layout, so the host width and the
 * `ResizeObserver` are stubbed.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import * as next from '../src';
import type { UnifiedPlotConfig } from '../src';

import { loadGalleryCollection } from './fixtures';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');

/** Stand-in for `ResizeObserver`: tests fire every live observer by hand. */
class FakeResizeObserver {
    static live: FakeResizeObserver[] = [];
    constructor(private readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.live.push(this);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
        FakeResizeObserver.live = FakeResizeObserver.live.filter(observer => observer !== this);
    }
    fire(): void {
        this.callback([], this as unknown as ResizeObserver);
    }
}

beforeEach(() => {
    FakeResizeObserver.live = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        callback(0);
        return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

/** Gives the host a layout width, as a browser would. */
function setHostWidth(div: HTMLElement, width: number): void {
    Object.defineProperty(div, 'clientWidth', { configurable: true, value: width });
}

/** Changes the host width and lets every observer react. */
function resize(div: HTMLElement, width: number): void {
    setHostWidth(div, width);
    [...FakeResizeObserver.live].forEach(observer => observer.fire());
}

function mount(config: Omit<UnifiedPlotConfig, 'collection'>, hostWidth?: number, div = document.createElement('div')) {
    document.body.append(div);
    if (hostWidth !== undefined) setHostWidth(div, hostWidth);
    const plot = new next.AutkPlot(div, { collection: regions(), ...config } as UnifiedPlotConfig);
    const svgWidth = () => (div.querySelector('svg#plot') as SVGSVGElement | null)?.style.width;
    return { div, plot, svgWidth };
}

const bars = (): Omit<UnifiedPlotConfig, 'collection'> => ({
    type: 'barchart',
    attributes: { axis: ['landuse', '@transform'] },
    transform: { preset: 'binning-1d' },
    width: 'auto',
    height: 280,
    events: [next.PlotEvent.CLICK],
    provenance: { path: true },
} as Omit<UnifiedPlotConfig, 'collection'>);

describe("width: 'auto'", () => {
    test('fills the content width of the host, without its padding', () => {
        const div = document.createElement('div');
        div.style.padding = '0 10px';
        const { svgWidth } = mount({ type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng'] }, width: 'auto', height: 280 } as Omit<UnifiedPlotConfig, 'collection'>, 500, div);
        expect(svgWidth()).toBe('480px');
    });

    test('falls back to 800 while the host has no layout', () => {
        // A hidden host has no layout, in a browser as in jsdom.
        const hidden = document.createElement('div');
        hidden.style.display = 'none';
        const { svgWidth } = mount({ type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng'] }, width: 'auto', height: 280 } as Omit<UnifiedPlotConfig, 'collection'>, undefined, hidden);
        expect(svgWidth()).toBe('800px');
    });

    test('a fixed width ignores the host and does not observe it', () => {
        const { svgWidth } = mount({ type: 'scatterplot', attributes: { axis: ['shape_area', 'shape_leng'] }, width: 300, height: 280 } as Omit<UnifiedPlotConfig, 'collection'>, 600);
        expect(svgWidth()).toBe('300px');
        expect(FakeResizeObserver.live).toHaveLength(0);
    });

    test('redraws at the new width and keeps an external selection, its painted parts and the provenance path', () => {
        const { div, plot, svgWidth } = mount(bars(), 480);
        const rows = plot.instance['_data'] as unknown as Array<{ autkIds: number[] }>;
        const row = rows.find(r => r.autkIds.length >= 2)!;
        const chosen = row.autkIds.slice(0, row.autkIds.length - 1);
        plot.setSelection(chosen);
        const parts = div.querySelectorAll('.autkPartial').length;
        expect(parts).toBeGreaterThan(0);

        const emitted = vi.fn();
        plot.events.on(next.PlotEvent.CLICK, emitted);
        resize(div, 720);

        expect(svgWidth()).toBe('720px');
        expect(plot.selection.sort((a, b) => a - b)).toEqual([...chosen].sort((a, b) => a - b));
        expect(div.querySelectorAll('.autkPartial')).toHaveLength(parts);
        expect(div.querySelectorAll('svg#plot')).toHaveLength(1);
        expect(emitted).not.toHaveBeenCalled();
        expect(div.querySelector<HTMLElement>('.autk-provenance')!.style.width).toBe('720px');
    });

    test('keeps a local click selection and clears stale brush rectangles', () => {
        const { div, plot } = mount(bars(), 480);
        div.querySelector('.autkMark')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        const selected = plot.selection;
        expect(selected.length).toBeGreaterThan(0);
        const brushes = plot.instance['_activeBrushes'] as Map<string, number[]>;
        brushes.set('0', [0, 0, 10, 10]);

        resize(div, 640);

        expect(plot.selection).toEqual(selected);
        expect(brushes.size).toBe(0);
        const marked = plot.instance['_selectedMarkDatums'] as Set<object>;
        const data = plot.instance['_data'] as unknown as object[];
        expect(marked.size).toBeGreaterThan(0);
        marked.forEach(datum => expect(data).toContain(datum));
    });

    test('does nothing when only the height of the host changes', () => {
        const { div, plot } = mount(bars(), 480);
        const draw = vi.spyOn(plot.instance, 'draw');
        resize(div, 480);
        expect(draw).not.toHaveBeenCalled();
    });

    test('hexagons are binned in the new drawing area', () => {
        const margins = { left: 40, right: 20, top: 30, bottom: 30 };
        const { div, plot } = mount({
            type: 'hexbin',
            attributes: { axis: ['shape_area', 'shape_leng'] },
            transform: { preset: 'binning-hex', options: { radius: 20 } },
            width: 'auto',
            height: 300,
            margins,
            events: [next.PlotEvent.CLICK],
        } as Omit<UnifiedPlotConfig, 'collection'>, 480);
        const options = () => (plot.instance['_transformConfig'] as { options: { width: number } }).options;
        expect(options().width).toBe(480 - margins.left - margins.right);
        resize(div, 760);
        expect(options().width).toBe(760 - margins.left - margins.right);
    });

    test('a plot replaced in its host stops following it', () => {
        const first = mount(bars(), 480);
        const second = mount(bars(), 480, first.div);
        const drawFirst = vi.spyOn(first.plot.instance, 'draw');

        resize(first.div, 700);

        expect(drawFirst).not.toHaveBeenCalled();
        expect(second.svgWidth()).toBe('700px');
        expect(FakeResizeObserver.live).toHaveLength(1);
    });

    test('a hidden host keeps the drawing and the brush until it shows again', () => {
        const { div, plot, svgWidth } = mount(bars(), 480);
        const brushes = plot.instance['_activeBrushes'] as Map<string, number[]>;
        brushes.set('0', [0, 0, 10, 10]);
        const draw = vi.spyOn(plot.instance, 'draw');

        resize(div, 0); // display: none, e.g. a closed tab

        expect(draw).not.toHaveBeenCalled();
        expect(svgWidth()).toBe('480px');
        expect(brushes.size).toBe(1);
    });

    test('a plot whose first draw throws leaves no observer behind', () => {
        next.registerPlot({ name: 'auto-width-broken', draw: () => { throw new Error('broken drawing'); } });
        try {
            const div = document.createElement('div');
            document.body.append(div);
            setHostWidth(div, 480);
            expect(() => new next.AutkPlot(div, { type: 'registered', plot: 'auto-width-broken', collection: regions(), attributes: { axis: ['shape_area'] }, width: 'auto', height: 200 } as UnifiedPlotConfig)).toThrow();
            expect(FakeResizeObserver.live).toHaveLength(0);
        } finally {
            next.unregisterPlot('auto-width-broken');
        }
    });

    test('destroy stops following the host and empties it', () => {
        const { div, plot } = mount(bars(), 480);
        plot.destroy();
        expect(FakeResizeObserver.live).toHaveLength(0);
        expect(div.childElementCount).toBe(0);
    });
});
