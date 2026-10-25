/**
 * The transform lab of the provenance use case, and the validator report it shows.
 *
 * The lab evaluates code written in the page, checks it against the contract,
 * and draws it only when every invariant holds. These tests run its templates
 * as the page does, drive its controls, and check that the report names the
 * invariant each violation breaks.
 */

import { afterEach, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { AutkDatum, TransformDefinition, UnifiedPlotConfig } from '../src';

import { LAB_TRANSFORM, LIB, setupLab } from '../../usecases/src/provenance/lab-transform';
import type { LabPlotConfig } from '../../usecases/src/provenance/lab-transform';
import { LAB_TEMPLATES } from '../../usecases/src/provenance/lab-transform-templates';
import { loadGalleryCollection, withSyntheticEvents } from './fixtures';

const regions = () => loadGalleryCollection('mnt_neighs_proj_landuse.geojson');
const withEvents = () => withSyntheticEvents(regions());

/** Evaluates a template as the lab does. */
function definitionOf(index: number): TransformDefinition {
    const returned = new Function('lib', LAB_TEMPLATES[index].code)(LIB);
    return { ...returned, name: LAB_TRANSFORM };
}

/** Columns and options of a template, parsed as the lab does. */
function inputsOf(index: number): [Record<string, unknown>, string[]] {
    return [JSON.parse(LAB_TEMPLATES[index].options), LAB_TEMPLATES[index].columns.split(',').map(c => c.trim())];
}

/** Builds the lab controls of usecases/src/provenance/main.html. */
function labDom(): void {
    document.body.innerHTML = `
        <select id="lab-template"></select>
        <input id="lab-columns" /><input id="lab-options" />
        <select id="lab-plot"></select>
        <button id="lab-run"></button>
        <textarea id="lab-code"></textarea>
        <p id="lab-message"></p>
        <ol id="lab-checks"></ol>`;
}

afterEach(() => {
    next.unregisterTransform(LAB_TRANSFORM);
    document.body.innerHTML = '';
});

describe('validator report', () => {
    const rows = () => regions().features.map((f, i) => ({ ...f.properties, autkIds: [i] })) as AutkDatum[];

    test('a valid transform has no violations; a non-additive one skips invariant 6', () => {
        const count = next.run(rows(), { preset: 'binning-1d' }, ['shape_area']);
        expect(next.checkProvenanceReport(rows().length, count.rows as AutkDatum[], count.provenance)).toEqual({ violations: [], skipped: [] });
        const avg = next.run(rows(), { preset: 'binning-1d', options: { reducer: 'avg', value: 'shape_leng' } }, ['shape_area']);
        expect(next.checkProvenanceReport(rows().length, avg.rows as AutkDatum[], avg.provenance)).toEqual({ violations: [], skipped: [6] });
    });

    test('each violation names its invariant, and 4 is skipped when the graph is malformed', () => {
        const result = next.run(rows(), { preset: 'binning-1d' }, ['shape_area']);
        const renamed = { ...result.provenance, stages: result.provenance.stages.map((s, i) => (i === 0 ? { ...s, name: 'X' } : s)) };
        const report = next.checkProvenanceReport(rows().length, result.rows as AutkDatum[], renamed);
        expect(new Set(report.violations.map(v => v.invariant))).toEqual(new Set([2, 3]));
        expect(report.skipped).toEqual([4]);
        // The string API keeps returning the same messages.
        expect(next.checkProvenance(rows().length, result.rows as AutkDatum[], renamed)).toEqual(report.violations.map(v => v.message));
    });

    test('a run that throws is invariant 0, and nothing else is checked', () => {
        const throwing: TransformDefinition = { name: 'x', shape: 'series', run: () => { throw new Error('boom'); } };
        expect(next.checkTransformReport(throwing, regions())).toEqual({
            violations: [{ invariant: 0, message: 'run threw: boom' }],
            skipped: [1, 2, 3, 4, 5, 6],
        });
    });
});

describe('lab templates', () => {
    test('regions by initial honors the contract and draws as bars and pie', () => {
        const definition = definitionOf(0);
        const [options, columns] = inputsOf(0);
        expect(next.checkTransformReport(definition, regions(), options, columns)).toEqual({ violations: [], skipped: [] });

        next.registerTransform(definition);
        for (const type of ['barchart', 'pie'] as const) {
            const plot = new next.AutkPlot(document.createElement('div'), {
                type,
                collection: regions(),
                attributes: { axis: [...columns, '@transform'] },
                transform: { preset: 'registered', name: LAB_TRANSFORM, options },
            } as UnifiedPlotConfig);
            const data = plot.instance['_data'] as unknown as { autkIds: number[] }[];
            // Every region falls under exactly one initial.
            expect(data.flatMap(row => row.autkIds).sort((a, b) => a - b)).toEqual(regions().features.map((_f, i) => i));
        }
    });

    test('complaints by weekday honors the contract and keeps the week order', () => {
        const definition = definitionOf(1);
        const [options, columns] = inputsOf(1);
        expect(next.checkTransformReport(definition, withEvents(), options, columns)).toEqual({ violations: [], skipped: [] });

        next.registerTransform(definition);
        const plot = new next.AutkPlot(document.createElement('div'), {
            type: 'linechart',
            collection: withEvents(),
            attributes: { axis: [...columns, '@transform'] },
            transform: { preset: 'registered', name: LAB_TRANSFORM, options },
        } as UnifiedPlotConfig);
        const data = plot.instance['_data'] as unknown as { label: string; y: number }[];
        const labels = data.map(row => row.label);
        expect(labels).toEqual(labels.slice().sort());
        const total = withEvents().features.reduce((sum, f) => sum + (f.properties!.sjoin.collect.noise as unknown[]).length, 0);
        expect(data.reduce((sum, row) => sum + row.y, 0)).toBe(total);
    });

    test('the broken example is refused on the inverse query and the sums', () => {
        const [options, columns] = inputsOf(2);
        const report = next.checkTransformReport(definitionOf(2), regions(), options, columns);
        expect(new Set(report.violations.map(v => v.invariant))).toEqual(new Set([4, 6]));
    });
});

describe('lab controls', () => {
    const start = () => {
        labDom();
        const drawn: (LabPlotConfig | null)[] = [];
        setupLab(regions(), (config) => { drawn.push(config); return undefined; });
        const click = () => document.querySelector<HTMLButtonElement>('#lab-run')!.click();
        const checks = () => Array.from(document.querySelectorAll('#lab-checks > li')).map(li => li.className);
        const message = () => document.querySelector('#lab-message')!.textContent ?? '';
        const choose = (index: number) => {
            const select = document.querySelector<HTMLSelectElement>('#lab-template')!;
            select.value = String(index);
            select.dispatchEvent(new Event('change'));
        };
        return { drawn, click, checks, message, choose };
    };

    test('a valid template is checked and drawn as a registered transform', () => {
        const { drawn, click, checks } = start();
        click();
        expect(checks()).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass']);
        expect(drawn[drawn.length - 1]).toMatchObject({ type: 'barchart', transform: { preset: 'registered', name: LAB_TRANSFORM } });
        expect(next.registeredTransform(LAB_TRANSFORM).shape).toBe('category-value');
    });

    test('the broken template is not drawn, and the failed invariants are shown', () => {
        const { drawn, click, checks, choose } = start();
        choose(2);
        click();
        expect(checks()).toEqual(['pass', 'pass', 'pass', 'fail', 'pass', 'fail']);
        expect(drawn[drawn.length - 1]).toBeNull();
    });

    test('code that does not run or does not return a definition is explained, not drawn', () => {
        const { drawn, click, message } = start();
        const code = document.querySelector<HTMLTextAreaElement>('#lab-code')!;
        code.value = 'return {';
        click();
        expect(message()).toMatch(/The code does not run/);
        code.value = 'return 1;';
        click();
        expect(message()).toMatch(/return \{ shape, run \}/);
        code.value = "return { shape: 'matrix', run() {} };";
        click();
        expect(message()).toMatch(/The registry refused/);
        expect(drawn[drawn.length - 1]).toBeNull();
    });
});
