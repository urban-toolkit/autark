/**
 * Try it Yourself (D3 chart): write a chart in plain D3, check its annotations
 * against the drawing contract, and draw it linked to every other view.
 *
 * Like the transform tab, the code runs in this browser only: it is evaluated
 * with `new Function`, checked by `checkPlot` on the case study regions, and drawn
 * as `{ type: 'registered' }` only when every invariant holds.
 */

import * as d3 from 'd3';

import * as next from '@urban-toolkit/autk-plot';
import type { PartialDesign, PlotDefinition, PlotTransformConfig } from '@urban-toolkit/autk-plot';

import { attachHighlighter } from './code-editor';
import { PLOT_HEIGHT } from './config';
import { renderChecks } from './lab-transform';
import type { Invariant, LabPlotConfig } from './lab-transform';
import { PLOT_LAB_TEMPLATES } from './lab-plot-templates';
import type { Collection } from './data';

/** Width of the contract check while the chart box has no layout (drawer closed). */
const CHECK_WIDTH = 480;

/** Name the lab's plot is registered under; redefining replaces it. */
export const LAB_PLOT = 'try-it-yourself-chart';

/** The drawing contract, in plain words. */
const PLOT_INVARIANTS: Invariant[] = [
    [1, 'Rows bound', 'Every mark binds a rendered row (the rows themselves, not copies)'],
    [2, 'All rows shown', 'Every row shows as a mark or as context (autkContext)'],
    [3, 'In the group', 'Marks are inside the marks group (or the HTML container)'],
    [4, 'Shapes', 'Marks are SVG shapes or HTML elements (these, click only)'],
    [5, 'Annotations', 'The data-autk-part and data-autk-origin annotations are valid'],
    [6, 'Parts painted', 'On a test selection, every selected part is painted'],
];

/** Why an invariant was not checked. */
const SKIPPED: Record<number, string> = {
    6: 'not checked: it needs 1 to 4',
};

/** Ways the regions become the rows of the drawing, as the Rows select offers them. */
const ROW_OPTIONS: { label: string; transform: PlotTransformConfig | null }[] = [
    { label: 'One per region', transform: null },
    { label: 'Grouped by the first field', transform: { preset: 'binning-1d' } },
    { label: 'Complaints per day', transform: { preset: 'binning-events', options: { timestamp: 'date', resolution: 'monthday' } } },
    { label: 'Box statistics per group', transform: { preset: 'box-stats' } },
    { label: 'Hierarchy of the fields', transform: { preset: 'hierarchy' } },
];
/** Value of the Rows option that reads a transform typed as JSON. */
const CUSTOM_ROWS = 'custom';

/** JSON with sorted keys, so two transforms compare by content. */
function canonical(value: unknown): string {
    return JSON.stringify(value, (_key, inner) => inner && typeof inner === 'object' && !Array.isArray(inner)
        ? Object.fromEntries(Object.entries(inner).sort(([a], [b]) => a.localeCompare(b)))
        : inner);
}

/** Mark families and rules of the design space, in plain words. */
const KINDS: Record<PartialDesign['kind'], string> = {
    rect: 'rectangles', point: 'points', sector: 'sectors', stroke: 'strokes', shape: 'shapes', html: 'HTML elements',
};
/** Side a length grows from, per axis. */
const SIDES = { y: { start: 'from the top', end: 'from the base', center: 'from the center' }, x: { start: 'from the left', end: 'from the right', center: 'from the center' } };

/**
 * Describes, in one short line, the partial view inferred for a mark family:
 * the marks, the channel that shows the value, and the part painted in it.
 */
function describeDesign(design: PartialDesign): string {
    const fit = design.fit === undefined ? '' : ` (R² ${design.fit.toFixed(3)})`;
    const [channel, part] = {
        units: ['units', 'selected units painted whole'],
        length: [`length in ${design.axis}`, `part grows ${SIDES[design.axis === 'x' ? 'x' : 'y'][design.anchor ?? 'end']}`],
        angle: ['angle', design.mode === 'sweep' ? 'leading share of the arc' : 'inner sector'],
        band: [`${design.mode === 'ribbon' ? 'ribbon' : 'flow'} thickness`, 'narrower band'],
        members: [`interval ${design.scale?.fields.join('–')}`, 'a point per selected region'],
        width: ['stroke width', 'thinner stroke'],
        position: [design.axis === 'radial' ? 'radial position' : `position in ${design.axis}`, 'slides to the selected value'],
        area: ['area', 'copy with the area of the fraction'],
        trace: ['no size channel', 'leading share of the stroke'],
        glyph: ['no size channel', design.kind === 'html' ? 'box filled up to the fraction' : 'copy with the area of the fraction'],
    }[design.rule];
    return `${design.marks} ${KINDS[design.kind]} · ${channel}${fit} → ${part}`;
}

/**
 * Evaluates lab code as the page does: the body of a function of `d3`.
 *
 * @returns The definition, under the lab's name.
 * @throws If the code does not run or does not return an object.
 */
export function plotDefinitionOf(code: string): PlotDefinition {
    const returned = new Function('d3', code)(d3);
    if (!returned || typeof returned !== 'object') throw new Error('The code must end with "return { draw }".');
    return { ...returned, name: LAB_PLOT };
}

/**
 * Plot config of the lab inputs.
 *
 * @param transform Transform JSON; empty for none (one row per region).
 */
export function plotLabConfig(columns: string, transform: string, event: string, title: string, margins: LabPlotConfig['margins']): LabPlotConfig {
    const parsed = transform.trim() === '' ? undefined : JSON.parse(transform) as PlotTransformConfig;
    return {
        type: 'registered',
        plot: LAB_PLOT,
        attributes: { axis: columns.split(',').map(col => col.trim()).filter(Boolean) },
        ...(parsed ? { transform: parsed } : {}),
        events: [event === 'brush' ? next.PlotEvent.BRUSH : next.PlotEvent.CLICK],
        labels: { title },
        margins,
    };
}

/**
 * Wires the plot lab controls.
 *
 * @param collection Regions the drawing is checked on.
 * @param draw Draws (or, with `null`, removes) the lab plot; returns an error message when the plot refuses the config.
 */
export function setupPlotLab(collection: Collection, draw: (config: LabPlotConfig | null) => string | undefined): void {
    const template = document.querySelector<HTMLSelectElement>('#plab-template')!;
    const code = document.querySelector<HTMLTextAreaElement>('#plab-code')!;
    const columns = document.querySelector<HTMLInputElement>('#plab-columns')!;
    const rows = document.querySelector<HTMLSelectElement>('#plab-rows')!;
    const transform = document.querySelector<HTMLInputElement>('#plab-transform')!;
    const custom = document.querySelector<HTMLElement>('#plab-transform-field')!;
    const recolor = attachHighlighter(code);
    const showCustom = () => { custom.hidden = rows.value !== CUSTOM_ROWS; };
    /** Transform JSON of the Rows select, or of the custom field; empty for one row per region. */
    const transformJson = () => {
        if (rows.value === CUSTOM_ROWS) return transform.value;
        const chosen = ROW_OPTIONS[Number(rows.value)].transform;
        return chosen ? JSON.stringify(chosen) : '';
    };
    const event = document.querySelector<HTMLSelectElement>('#plab-event')!;
    const checks = document.querySelector<HTMLElement>('#plab-checks')!;
    const message = document.querySelector<HTMLElement>('#plab-message')!;
    const design = document.querySelector<HTMLElement>('#plab-design')!;
    const plotBox = document.querySelector<HTMLElement>('#plab-plot-box')!;
    const showDesign = (designs: PartialDesign[]) => {
        design.replaceChildren(...designs.map(d => Object.assign(document.createElement('li'), { textContent: describeDesign(d) })));
        design.parentElement!.hidden = designs.length === 0;
    };

    const say = (text: string, kind: 'ok' | 'error') => {
        message.textContent = text;
        message.className = `lab-message ${kind}`;
    };
    const fail = (text: string) => {
        next.unregisterPlot(LAB_PLOT);
        draw(null);
        renderChecks(checks, null);
        showDesign([]);
        say(text, 'error');
    };

    const loadTemplate = () => {
        const chosen = PLOT_LAB_TEMPLATES[Number(template.value)];
        code.value = chosen.code;
        recolor();
        columns.value = chosen.columns;
        const known = ROW_OPTIONS.findIndex(option => canonical(option.transform) === canonical(chosen.transform));
        rows.value = known >= 0 ? String(known) : CUSTOM_ROWS;
        transform.value = chosen.transform ? JSON.stringify(chosen.transform) : '';
        showCustom();
        event.value = chosen.event;
        draw(null);
        renderChecks(checks, null);
        showDesign([]);
        say('Edit the drawing and click "Check and draw".', 'ok');
    };

    const run = () => {
        const chosen = PLOT_LAB_TEMPLATES[Number(template.value)];
        let config: LabPlotConfig;
        try {
            config = plotLabConfig(columns.value, transformJson(), event.value, chosen.title.replace(/ \(.*\)$/, ''), chosen.margins);
        } catch (error) {
            return fail(`The transform is not valid JSON: ${(error as Error).message}`);
        }
        let definition: PlotDefinition;
        try {
            definition = plotDefinitionOf(code.value);
        } catch (error) {
            return fail(`The code does not run: ${(error as Error).message}`);
        }

        // Check on a drawing off screen, at the size the chart will be drawn: the width of its box.
        const width = plotBox.clientWidth || CHECK_WIDTH;
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;left:-10000px;top:0;width:${width}px;visibility:hidden`;
        document.body.append(probe);
        const { type, ...checked } = config;
        void type;
        const report = next.checkPlot(definition, probe, { ...checked, collection, width, height: PLOT_HEIGHT });
        probe.remove();

        renderChecks(checks, report, PLOT_INVARIANTS, SKIPPED);
        showDesign(report.designs);
        const failure = report.violations.find(v => v.invariant === 0);
        if (failure) return fail(`The drawing failed: ${failure.message}`);
        if (report.violations.length > 0) {
            draw(null);
            return say('Not drawn: with these violations, selection and the provenance view would not know what each mark stands for.', 'error');
        }

        next.unregisterPlot(LAB_PLOT);
        try {
            next.registerPlot(definition);
        } catch (error) {
            return fail(`The registry refused the definition: ${(error as Error).message}`);
        }
        const error = draw(config);
        if (error) return say(`The chart refused the configuration: ${error}`, 'error');
        say('Contract met: linked to the map and the 24 charts.', 'ok');
    };

    template.replaceChildren(...PLOT_LAB_TEMPLATES.map((t, index) => new Option(t.title, String(index))));
    rows.replaceChildren(
        ...ROW_OPTIONS.map((option, index) => new Option(option.label, String(index))),
        new Option('Custom (JSON)…', CUSTOM_ROWS),
    );
    rows.addEventListener('change', showCustom);
    template.addEventListener('change', loadTemplate);
    document.querySelector('#plab-run')!.addEventListener('click', run);
    loadTemplate();
}
