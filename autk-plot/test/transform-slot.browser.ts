/**
 * The `'@transform'` slot: every transform that computes a value accepts it,
 * after the input columns or in `attributes.color` when the value is drawn as
 * a color, and a plot draws the same with and without it. It only names where
 * the computed value goes; the input columns are the other entries.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import * as autkPlot from '../src';

import { movingAverage } from '../../usecases/src/provenance/moving-average';
import { PLOTS, withReducer } from '../../usecases/src/provenance/plot';
import type { LinkedPlot } from '../../usecases/src/provenance/plot';
import { loadGalleryCollection, withSyntheticEvents } from './fixtures';

const SLOT = '@transform';

/** The page's data: regions with their complaints, their number, and their daily series. */
function collection() {
    const regions = withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj_landuse.geojson'));
    for (const feature of regions.features) {
        const sjoin = feature.properties!.sjoin as { collect: { noise: unknown[] }; count?: { noise: number } };
        sjoin.count = { noise: sjoin.collect.noise.length };
    }
    return regions;
}

/** The plot config without the slot, wherever it is. */
function withoutSlot(config: LinkedPlot['config']): LinkedPlot['config'] {
    const { axis, color } = config.attributes ?? {};
    return {
        ...config,
        attributes: {
            axis: (axis ?? []).filter(field => field !== SLOT),
            ...(color && color !== SLOT ? { color } : {}),
        },
    };
}

/** The plot config with the slot where the convention puts it. */
function withSlot(config: LinkedPlot['config']): LinkedPlot['config'] {
    const plain = withoutSlot(config);
    const asColor = config.attributes?.color === SLOT || config.transform?.preset === 'binning-hex';
    return asColor
        ? { ...plain, attributes: { ...plain.attributes, color: SLOT } }
        : { ...plain, attributes: { ...plain.attributes, axis: [...(plain.attributes?.axis ?? []), SLOT] } };
}

function draw(config: LinkedPlot['config'], event: autkPlot.PlotEvent): HTMLElement {
    const div = document.createElement('div');
    new autkPlot.AutkPlot(div, { ...withReducer(config, 'count'), collection: collection(), width: 480, height: 280, events: [event] } as never);
    return div;
}

/** Plots of the page whose transform computes a value (not `sort`, not none). */
const aggregating = PLOTS.filter(plot => plot.config.transform && plot.config.transform.preset !== 'sort');

beforeAll(() => autkPlot.registerTransform(movingAverage));
afterAll(() => autkPlot.unregisterTransform(movingAverage.name));

describe("the '@transform' slot", () => {
    test.each(aggregating.map(plot => [plot.name, plot] as const))('%s draws the same with and without it', (_name, plot) => {
        const plain = draw(withoutSlot(plot.config), plot.event);
        const slotted = draw(withSlot(plot.config), plot.event);
        expect(slotted.innerHTML).toBe(plain.innerHTML);
    });

    test.each(aggregating.map(plot => [plot.name, plot] as const))('%s never shows it as an axis label', (_name, plot) => {
        const unlabeled = { ...plot.config, labels: undefined };
        const slotted = draw(withSlot(unlabeled), plot.event);
        expect(slotted.innerHTML).not.toContain(SLOT);
    });

    test('is refused by a transform that computes no value, and without a transform', () => {
        const table = PLOTS.find(plot => plot.config.type === 'table')!;
        const sorted = { ...table.config, transform: { preset: 'sort' as const } };
        expect(() => draw(withSlot(sorted), table.event)).toThrow(/cannot be used with the 'sort' preset/);
        const scatter = PLOTS.find(plot => !plot.config.transform)!;
        expect(() => draw(withSlot(scatter.config), scatter.event)).toThrow(/without a transform/);
    });
});

describe('the slot leaves the label of the computed value unset', () => {
    test('a user plot reads no empty label for it, as with no slot', () => {
        const seen: (string | undefined)[][] = [];
        autkPlot.registerPlot({
            name: 'reads-labels',
            draw({ group, rows, axisLabels }) {
                seen.push([...axisLabels]);
                group.selectAll('rect').data(rows).join('rect').attr('class', 'autkMark').attr('width', 4).attr('height', 4);
            },
        });
        try {
            for (const axis of [['landuse', SLOT], ['landuse']]) {
                const div = document.createElement('div');
                new autkPlot.AutkPlot(div, { type: 'registered', plot: 'reads-labels', collection: collection(), width: 300, height: 200, attributes: { axis }, transform: { preset: 'binning-1d' } } as never);
            }
            expect(seen).toEqual([['landuse'], ['landuse']]);
        } finally {
            autkPlot.unregisterPlot('reads-labels');
        }
    });
});
