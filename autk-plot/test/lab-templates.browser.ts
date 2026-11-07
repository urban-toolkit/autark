/**
 * The built-in charts and transforms of Try it Yourself are the code autk-plot registers.
 *
 * `usecases/src/provenance/lab-builtin-templates.ts` is generated from
 * `src/plots` and `src/transforms/presets` by `scripts/lab-templates.mjs`.
 * `usecases/test/lab-templates.test.ts` fails when it is out of date; these tests check that each chart
 * template, run as a user plot in the page's scope, draws exactly what the
 * built-in chart draws (the same marks, and the same parts after a
 * selection), and that each transform template, run as a user transform,
 * gives the built-in output and draws the same chart of the page.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, PlotDefinition, TransformDefinition, UnifiedPlotConfig } from '../src';

import { LAB_PLOT, plotDefinitionOf, plotLabConfig, transformConfigOf, transformFields } from '../../usecases/src/provenance/lab-plot';
import { PLOT_LAB_TEMPLATES } from '../../usecases/src/provenance/lab-plot-templates';
import { evaluateChart } from '../../usecases/src/provenance/lab-scope';
import { LAB_TRANSFORM, chartsFor, transformDefinitionOf, transformLabConfig } from '../../usecases/src/provenance/lab-transform';
import { LAB_TEMPLATES } from '../../usecases/src/provenance/lab-transform-templates';
import { PLOTS } from '../../usecases/src/provenance/plot';
import { withDailyComplaints } from '../../usecases/src/provenance/data';
import { movingAverage } from '../../usecases/src/provenance/moving-average';
import { loadGalleryCollection, withSyntheticEvents } from './fixtures';
import { installSvgBBox } from './svg-geometry';

/** Regions with complaints, their number as the page counts them (`sjoin.count.noise`), and their daily series (`noise_daily`). */
function regions() {
    const collection = withSyntheticEvents(loadGalleryCollection('mnt_neighs_proj_landuse.geojson'));
    for (const feature of collection.features) {
        const sjoin = feature.properties!.sjoin as { collect: { noise: unknown[] }; count?: { noise: number } };
        sjoin.count = { noise: sjoin.collect.noise.length };
    }
    return withDailyComplaints(collection);
}
const builtIns = PLOT_LAB_TEMPLATES.filter(t => t.group === 'built-in');

/** A template transform as the page gives it: through the Transform list and the options field. */
const roundTrip = (transform: Parameters<typeof transformFields>[0]) => {
    const { choice, options } = transformFields(transform);
    return transformConfigOf(choice, options);
};

/**
 * What a drawing shows: every mark and part, with all its attributes and
 * styles. Clip ids are numbered across the page, so only their use is kept.
 */
function drawingOf(div: HTMLElement): string[] {
    return Array.from(div.querySelectorAll('.autkMark, .autkPartial, .autkPartialSeries')).map(element =>
        `${element.tagName.toLowerCase()} ${Array.from(element.attributes).map(a => `${a.name}=${a.value.replace(/autk-part-(radial-)?\d+/g, 'autk-part-#')}`).sort().join(' ')}`);
}

describe('built-in chart templates of Try it Yourself', () => {
    beforeAll(() => {
        installSvgBBox();
        next.registerTransform(movingAverage);
    });
    afterAll(() => next.unregisterTransform(movingAverage.name));

    test('cover the 24 built-in charts, once each', () => {
        const names = builtIns.map(t => (evaluateChart(t.code) as PlotDefinition).name);
        expect(new Set(names).size).toBe(24);
        expect(names.every(name => next.hasRegisteredPlot(name))).toBe(true);
    });

    test.each(builtIns.map(t => [t.title, t] as const))('%s: run as a user plot, it draws what the built-in chart draws', (_title, template) => {
        const { type, plot, ...config } = plotLabConfig(template.columns, roundTrip(template.transform), template.event, template.chartTitle ?? template.title, template.margins);
        void type;
        void plot;
        const builtIn = (evaluateChart(template.code) as PlotDefinition).name;
        next.unregisterPlot(LAB_PLOT);
        next.registerPlot(plotDefinitionOf(template.code));

        const draw = (which: Partial<UnifiedPlotConfig>) => {
            const div = document.createElement('div');
            document.body.append(div);
            const drawn = new next.AutkPlot(div, { ...config, ...which, collection: regions(), width: 480, height: 280 } as UnifiedPlotConfig);
            drawn.setSelection([0, 1, 2, 3, 4, 5, 6, 7]);
            const result = drawingOf(div);
            div.remove();
            return result;
        };
        try {
            const asUserPlot = draw({ type: 'registered', plot: LAB_PLOT } as Partial<UnifiedPlotConfig>);
            const asBuiltIn = draw({ type: builtIn } as Partial<UnifiedPlotConfig>);
            expect(asUserPlot.length).toBeGreaterThan(0);
            expect(asUserPlot).toEqual(asBuiltIn);
        } finally {
            next.unregisterPlot(LAB_PLOT);
        }
    });
});

describe('built-in transform templates of Try it Yourself', () => {
    const transforms = LAB_TEMPLATES.filter(t => t.group === 'built-in');
    beforeAll(() => installSvgBBox());
    afterAll(() => next.unregisterTransform(LAB_TRANSFORM));

    test('cover the 12 built-in transforms, once each', () => {
        const names = transforms.map(t => (evaluateChart(t.code) as TransformDefinition).name);
        expect(new Set(names).size).toBe(12);
        expect(names.every(name => next.registeredTransform(name).name === name)).toBe(true);
    });

    test.each(transforms.map(t => [t.title, t] as const))('%s: run as a user transform, it gives the built-in output and draws the same chart', (_title, template) => {
        const builtIn = (evaluateChart(template.code) as TransformDefinition).name;
        const columns = template.columns.split(',').map(c => c.trim()).filter(Boolean);
        const options = JSON.parse(template.options) as Record<string, unknown>;
        next.unregisterTransform(LAB_TRANSFORM);
        const definition = transformDefinitionOf(template.code);
        next.registerTransform(definition);

        // The same rows and provenance, and the whole contract.
        const rows = () => regions().features.map((f, i) => ({ ...f.properties, autkIds: [i] })) as AutkDatum[];
        const asUser = next.run(rows(), { preset: 'registered', name: LAB_TRANSFORM, options }, columns);
        const asBuiltIn = next.run(rows(), { preset: builtIn, options } as never, columns);
        expect(asUser.rows.length).toBeGreaterThan(0);
        expect(asUser.rows).toEqual(asBuiltIn.rows);
        expect(asUser.provenance).toEqual(asBuiltIn.provenance);
        expect(next.checkTransformReport(definition, regions(), options, columns).violations).toEqual([]);

        // Drawn by the chart of the page the lab offers first, as the built-in transform is.
        const chart = PLOTS.find(p => p.name === template.plot)!;
        expect(chartsFor(definition.shape)).toContain(chart);
        const config = transformLabConfig(chart, columns, options, template.title);
        const draw = (transform: UnifiedPlotConfig['transform']) => {
            const div = document.createElement('div');
            document.body.append(div);
            const drawn = new next.AutkPlot(div, { ...config, transform, collection: regions(), width: 480, height: 280 } as UnifiedPlotConfig);
            drawn.setSelection([0, 1, 2, 3, 4, 5, 6, 7]);
            const result = drawingOf(div);
            drawn.destroy();
            div.remove();
            return result;
        };
        const userDrawing = draw(config.transform);
        expect(userDrawing.length).toBeGreaterThan(0);
        expect(userDrawing).toEqual(draw({ preset: builtIn, options } as never));
    // Each case runs the transform four times and draws twice: past the default 5 s on a busy machine.
    }, 20000);
});
