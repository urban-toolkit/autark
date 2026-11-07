/**
 * Provenance path widget drawn under every plot.
 */

import { describe, expect, test } from 'vitest';

import * as next from '../src';
import type { UnifiedPlotConfig } from '../src';
import { renderProvenancePathView } from '../src/provenance/path-view';
import type { ProvenancePathViewState } from '../src/provenance/path-view';
import type { ProvenanceCardinality } from '../src/types-provenance';

import { loadGalleryCollection, withSyntheticEvents } from './fixtures';

const histogram = (extra: Partial<UnifiedPlotConfig> = {}): UnifiedPlotConfig => ({
    type: 'barchart',
    collection: loadGalleryCollection('mnt_neighs_proj.geojson'),
    attributes: { axis: ['shape_area', '@transform'] },
    transform: { preset: 'binning-1d', options: { bins: 10 } },
    events: [next.PlotEvent.CLICK],
    ...extra,
});

/** Builds a plot with the widget on (unless the config says otherwise) and returns helpers to read and drive it. */
function mount(config: UnifiedPlotConfig) {
    const div = document.createElement('div');
    const plot = new next.AutkPlot(div, { provenance: { path: true }, ...config } as UnifiedPlotConfig);
    const widget = () => div.querySelector('.autk-provenance');
    const toggle = () => div.querySelector<HTMLButtonElement>('.autk-provenance-toggle')!;
    const chips = () => Array.from(div.querySelectorAll('.autk-provenance-stage')).map(n => n.textContent);
    const steps = () => Array.from(div.querySelectorAll('.autk-provenance-step')).map(n => n.textContent);
    return { div, plot, widget, toggle, chips, steps };
}

describe('provenance path widget', () => {
    test('every plot type gets a closed widget under it', () => {
        const collection = () => withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj_landuse.geojson'));
        const configs: UnifiedPlotConfig[] = [
            histogram(),
            { type: 'scatterplot', collection: collection(), attributes: { axis: ['shape_area', 'shape_leng'] } },
            { type: 'table', collection: collection(), attributes: { axis: ['ntaname'] } },
            { type: 'parallel-coordinates', collection: collection(), attributes: { axis: ['shape_area', 'shape_leng'] } },
            { type: 'heatmatrix', collection: collection(), attributes: { axis: ['shape_area', 'landuse'], color: '@transform' }, transform: { preset: 'binning-2d' } },
            { type: 'linechart', collection: collection(), attributes: { axis: ['sjoin.collect.noise', '@transform'] }, transform: { preset: 'binning-events' } },
        ];

        for (const config of configs) {
            const { widget, toggle } = mount(config);
            expect(widget(), config.type).not.toBeNull();
            expect(toggle().getAttribute('aria-expanded')).toBe('false');
            expect(toggle().textContent).toContain('no selection');
        }
    });

    test('an external selection shows the direct path with stage counts and cardinalities', () => {
        const { plot, toggle, chips, steps } = mount(histogram());
        plot.setSelection([0]);
        expect(toggle().textContent).toContain('1 → 1 → 1 → 1 · direct');

        toggle().click();
        expect(chips()).toEqual(['D0features 1', 'D1bins 1', 'D2aggregates 1', 'Mmarks 1']);
        expect(steps()).toEqual(['→N:1', '→1:1', '→1:1']);
    });

    test('a local click shows the inverse path back to the six features', () => {
        const { div, toggle, chips, steps } = mount(histogram());
        toggle().click();
        div.querySelectorAll('.autkMark')[4].dispatchEvent(new MouseEvent('click', { bubbles: true }));

        expect(toggle().textContent).toContain('1 → 1 → 1 → 6 · inverse');
        expect(chips()).toEqual(['Mmarks 1', 'D2aggregates 1', 'D1bins 1', 'D0features 6']);
        expect(steps()).toEqual(['→1:1', '→1:1', '→1:N']);
    });

    test('the widget stays open across selections and redraws', () => {
        const { plot, toggle, chips } = mount(histogram());
        toggle().click();
        plot.setSelection([0, 7]);
        plot.draw();
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
        expect(chips()[0]).toBe('D0features 2');
    });

    test("path: 'open' starts with the path expanded", () => {
        const { toggle } = mount(histogram({ provenance: { path: 'open' } }));
        expect(toggle().getAttribute('aria-expanded')).toBe('true');
    });

    test('the icon keeps its size under page rules like the gallery svg { width: 100% }', () => {
        const { toggle } = mount(histogram());
        const icon = toggle().querySelector('svg')!;
        expect(icon.style.width).toBe('14px');
        expect(icon.style.height).toBe('14px');
    });

    test('path: false removes the widget', () => {
        expect(mount(histogram({ provenance: { path: false } })).widget()).toBeNull();
    });

    test('the widget is off by default, so the plot keeps the height its host gives it', () => {
        const div = document.createElement('div');
        new next.AutkPlot(div, histogram());
        expect(div.querySelector('.autk-provenance')).toBeNull();
    });
});

/** Steps of an open widget, as `from→to cardinality`, for a path and its relations. */
function stepsOf(direction: 'direct' | 'inverse', stages: string[], cardinalities: [string, ProvenanceCardinality][]): string[] {
    const host = document.createElement('div');
    const state: ProvenancePathViewState = {
        open: true,
        direction,
        path: stages.map(stage => ({ stage, label: stage.toLowerCase(), ids: ['x'] })),
        cardinalities: new Map(cardinalities),
        parts: [],
        notes: [],
        width: 400,
        onToggle: () => undefined,
    };
    renderProvenancePathView(host, state);
    return Array.from(host.querySelectorAll('.autk-provenance-step')).map((step, index) => `${stages[index]}→${stages[index + 1]} ${step.textContent!.slice(1)}`);
}

describe('provenance path widget: cardinalities', () => {
    test('each step shows the cardinality of its relation, read backwards in an inverse path', () => {
        const relations: [string, ProvenanceCardinality][] = [['D0→D1', 'N:1'], ['D1→M', '1:1']];
        expect(stepsOf('direct', ['D0', 'D1', 'M'], relations)).toEqual(['D0→D1 N:1', 'D1→M 1:1']);
        expect(stepsOf('inverse', ['M', 'D1', 'D0'], relations)).toEqual(['M→D1 1:1', 'D1→D0 1:N']);
    });

    test('when the marks draw an earlier stage, the step into M names the stage the relation starts at', () => {
        // A treemap: the marks are the leaves (D1), not the groups (D2).
        const relations: [string, ProvenanceCardinality][] = [['D0→D1', 'N:1'], ['D1→D2', 'N:1'], ['D1→M', '1:1']];
        expect(stepsOf('direct', ['D0', 'D1', 'D2', 'M'], relations)).toEqual(['D0→D1 N:1', 'D1→D2 N:1', 'D2→M 1:1 (D1)']);
        expect(stepsOf('inverse', ['M', 'D2', 'D1', 'D0'], relations)).toEqual(['M→D2 1:1 (D1)', 'D2→D1 1:N', 'D1→D0 1:N']);
    });
});
