/**
 * Try It Yourself (D3 chart): write a chart in plain D3, check its annotations
 * against the drawing contract, and draw it linked to every other view.
 *
 * Like the transform tab, the code runs in this browser only: it is evaluated
 * with `new Function` (`lab-scope.ts`), checked by `checkPlot` on the case study regions, and drawn
 * as `{ type: 'registered' }` only when every invariant holds.
 */

import * as autkPlot from '@urban-toolkit/autk-plot';
import type { AutkDatum, HighlightDesign, PlotDefinition, PlotTransformConfig, TopKConfig, TransformDefinition } from '@urban-toolkit/autk-plot';

import { attachHighlighter } from './code-editor';
import { PLOT_HEIGHT } from './config';
import { BUILT_IN_TRANSFORM_TEMPLATES } from './lab-builtin-templates';
import { movingAverage } from './moving-average';
import { LAB_PLOT_NAME, mayReplaceCode, plainMessage, projectNameNote, regionProperties, renderChecks } from './lab-transform';
import type { Invariant, LabPlotConfig } from './lab-transform';
import { PLOT_LAB_TEMPLATES } from './lab-plot-templates';
import type { PlotLabTemplate } from './lab-plot-templates';
import { evaluateChart } from './lab-scope';
import { LAB_TEMPLATES } from './lab-transform-templates';
import { PLOTS, transformOfChart } from './plot';
import type { Collection } from './data';

/** Width of the contract check while the chart box has no layout (drawer closed). */
const CHECK_WIDTH = 480;

/** Name the lab's plot is registered under; redefining replaces it. */
export const LAB_PLOT = LAB_PLOT_NAME;

/** The drawing contract, in plain words. */
const PLOT_INVARIANTS: Invariant[] = [
    [1, 'Rows bound', 'Every mark binds a rendered row (the rows themselves, not copies)'],
    [2, 'All rows shown', 'Every row shows as a mark or as context (autkContext)'],
    [3, 'In the group', 'Marks are inside the marks group (or the HTML container)'],
    [4, 'Shapes', 'Marks are SVG shapes or HTML elements (HTML marks: click only)'],
    [5, 'Annotations', 'The data-autk-highlight annotations are valid (none or boolean)'],
    [6, 'Parts highlighted', 'On a test selection, every selected part is highlighted'],
];

/** Why an invariant was not checked. */
const SKIPPED: Record<number, string> = {
    6: 'not checked: it needs 1 to 4, and a part to test',
};

/** Value of the Transform list for one row per region (no transform). */
const NO_TRANSFORM = '';
/** Prefix of the Transform list values of transforms registered by this page. */
const REGISTERED = 'registered:';

/**
 * Transforms the Transform list offers: the 12 built-in ones, in the order
 * they are registered, and the one this page registers (the moving average),
 * each as `[value, label]`.
 */
const TRANSFORM_CHOICES: { group: string; choices: [string, string][] }[] = [
    {
        group: "autk-plot's 12 transforms",
        choices: BUILT_IN_TRANSFORM_TEMPLATES.map(template => {
            const { name, label } = evaluateChart(template.code) as TransformDefinition;
            return [name, `${label ?? name} (${name})`];
        }),
    },
    { group: 'Registered by this page', choices: [[REGISTERED + movingAverage.name, `${movingAverage.label ?? movingAverage.name} (${movingAverage.name})`]] },
];

/**
 * The Transform list value and the options JSON of a transform config.
 *
 * @param transform Transform of a template; `null` for one row per region.
 */
export function transformFields(transform: PlotTransformConfig | null): { choice: string; options: string } {
    if (!transform) return { choice: NO_TRANSFORM, options: '' };
    const choice = transform.preset === 'registered' ? REGISTERED + (transform as { name: string }).name : transform.preset;
    const options = (transform as { options?: Record<string, unknown> }).options;
    return { choice, options: options && Object.keys(options).length > 0 ? JSON.stringify(options) : '' };
}

/**
 * Options of a Transform list value: those of the page chart that runs it, or none.
 *
 * @param choice Value of the Transform list.
 * @returns The options JSON (empty for no transform or no options).
 */
export function optionsOfChoice(choice: string): string {
    const transform = transformConfigOf(choice, '');
    if (!transform) return '';
    const name = (config: PlotTransformConfig) => (config.preset === 'registered' ? REGISTERED + (config as { name: string }).name : config.preset);
    const chart = PLOTS.find(plot => { const used = transformOfChart(plot); return !!used && name(used) === choice; });
    if (chart) return transformFields(transformOfChart(chart)!).options;
    // A transform no chart of the page runs (reduce-series) takes the options of its Transform tab template.
    const template = LAB_TEMPLATES.find(candidate => candidate.name === choice);
    return template && template.options !== '{}' ? template.options : transformFields(transform).options;
}

/**
 * The transform config of the Transform list value and the options JSON.
 *
 * @returns `null` for one row per region.
 * @throws If the options are not a JSON object.
 */
export function transformConfigOf(choice: string, options: string): PlotTransformConfig | null {
    if (choice === NO_TRANSFORM) return null;
    const parsed: unknown = options.trim() === '' ? {} : JSON.parse(options);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('the options must be a JSON object, such as {"bins": 10}');
    const given = Object.keys(parsed).length > 0 ? { options: parsed } : {};
    return (choice.startsWith(REGISTERED)
        ? { preset: 'registered', name: choice.slice(REGISTERED.length), ...given }
        : { preset: choice, ...given }) as PlotTransformConfig;
}

/** Mark families of the highlight, in plain words. */
const KINDS: Record<HighlightDesign['kind'], string> = {
    rect: 'rectangles', point: 'points', sector: 'sectors', stroke: 'strokes', shape: 'shapes', html: 'HTML elements',
};
/** Side a length grows from, per axis. */
const SIDES = { y: { start: 'from the top', end: 'from the base', center: 'from the center' }, x: { start: 'from the left', end: 'from the right', center: 'from the center' } };

/**
 * Describes, in one short line, the highlight resolved for a mark family:
 * the marks, the mode, what it repeats or draws, and the part shown.
 */
export function describeHighlight(design: HighlightDesign): string {
    const fit = design.fit === undefined ? '' : ` (R² ${design.fit.toFixed(3)})`;
    const marks = `${design.marks} ${KINDS[design.kind]}`;
    if (design.mode === 'boolean') return `${marks} · boolean → the whole mark`;
    if (design.mode === 'custom') {
        const part = {
            members: `a point per selected region, on the interval ${design.scale?.fields.join('–')}`,
            trace: design.kind === 'stroke' ? 'leading share of the stroke' : 'leading share of the outline',
            glyph: design.kind === 'html' ? 'box filled up to the fraction' : 'inner copy with the area of the fraction',
        }[design.preset];
        // A preset that stands in for lack of evidence says so, and how to get a subset render.
        const note = design.unproven ? ' (no channel proven: fewer than three distinct values; declare the channel for a subset render)' : '';
        return `${marks} · custom (${design.preset})${fit} → ${part}${note}`;
    }
    const [channel, part] = {
        units: ['units', 'the selected units, whole'],
        length: [`length in ${design.axis}`, `the subset's length, ${SIDES[design.axis === 'x' ? 'x' : 'y'][design.anchor ?? 'end']}`],
        angle: ['angle', "the subset's sweep, from the same start"],
        band: [`${design.shape === 'ribbon' ? 'ribbon' : 'flow'} thickness`, "the subset's band"],
        width: ['stroke width', "the subset's stroke width"],
        position: [design.axis === 'radial' ? 'radial position' : `position in ${design.axis}`, "at the subset's value"],
        area: ['area', "the subset's area, inside the mark"],
    }[design.channel];
    return `${marks} · subset render: ${channel}${fit} → ${part}`;
}

/**
 * Evaluates lab code as the page does: the body of a function of `d3`,
 * `autk` and `core`.
 *
 * @returns The definition, under the lab's name.
 * @throws If the code does not run or does not return an object.
 */
export function plotDefinitionOf(code: string): PlotDefinition {
    const returned = evaluateChart(code);
    if (!returned || typeof returned !== 'object' || typeof (returned as PlotDefinition).draw !== 'function') {
        throw new Error('The code must end with "return { draw }", draw being a function.');
    }
    return { ...(returned as PlotDefinition), name: LAB_PLOT };
}

/** Event of each option of the Select by list. */
const LAB_EVENTS: Record<string, autkPlot.PlotEvent> = {
    click: autkPlot.PlotEvent.CLICK,
    brush: autkPlot.PlotEvent.BRUSH,
    'brush-x': autkPlot.PlotEvent.BRUSH_X,
    'brush-y': autkPlot.PlotEvent.BRUSH_Y,
};

/**
 * Rows the transform of a lab config gives the regions.
 *
 * @param collection Regions of the page.
 * @param config Lab config with a transform.
 * @returns The transformed rows, or none when the transform fails (the drawing reports why).
 */
function rowsOf(collection: Collection, config: LabPlotConfig): unknown[] {
    const source = collection.features.map((feature, index) => ({ ...(feature.properties ?? {}), autkIds: [index] })) as AutkDatum[];
    const fields = (config.attributes?.axis ?? []).filter(field => field !== '@transform');
    try {
        return autkPlot.run(source, config.transform!, fields).rows;
    } catch {
        return [undefined];
    }
}

/**
 * Plot config of the lab inputs.
 *
 * @param transform Transform of the rows; `null` for none (one row per region).
 */
export function plotLabConfig(columns: string, transform: PlotTransformConfig | null, event: string, title: string, margins: LabPlotConfig['margins'], topK?: TopKConfig, axisLabels?: string[]): LabPlotConfig {
    return {
        type: 'registered',
        plot: LAB_PLOT,
        attributes: { axis: columns.split(',').map(col => col.trim()).filter(Boolean) },
        ...(transform ? { transform } : {}),
        events: [LAB_EVENTS[event] ?? autkPlot.PlotEvent.CLICK],
        labels: { title, ...(axisLabels ? { axis: axisLabels } : {}) },
        margins,
        ...(topK ? { topK } : {}),
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
    const transform = document.querySelector<HTMLSelectElement>('#plab-transform')!;
    const options = document.querySelector<HTMLInputElement>('#plab-options')!;
    const recolor = attachHighlighter(code);
    // The fields a person can name.
    const fieldsLabel = columns.closest('label');
    if (fieldsLabel) fieldsLabel.title += `. Region properties: ${regionProperties(collection).join(', ')}`;
    // With no transform there are no options to give.
    const rowsHint = document.querySelector<HTMLElement>('#plab-rows');
    // Fields of the rows of the chosen transform, to explain a drawing that reads one they lack.
    let rowsFields: string[] = [];
    const enableOptions = () => {
        options.disabled = transform.value === NO_TRANSFORM;
        // The fields of the rows the drawing receives, from the shape the transform declares.
        if (!rowsHint) return;
        const config = transformConfigOf(transform.value, '');
        const name = config ? (config.preset === 'registered' ? (config as { name: string }).name : config.preset) : '';
        const fields = name ? autkPlot.shapeFields(autkPlot.registeredTransform(name).shape) : [];
        rowsFields = fields;
        const names = (list: string[]) => list.map(field => `<code>${field}</code>`).join(', ');
        rowsHint.innerHTML = fields.length > 0
            ? `<code>draw</code> receives rows with ${names(fields)} and <code>autkIds</code>.`
            : `<code>draw</code> receives one row per region: its properties and <code>autkIds</code>.`;
    };
    const event = document.querySelector<HTMLSelectElement>('#plab-event')!;
    const checks = document.querySelector<HTMLElement>('#plab-checks')!;
    const message = document.querySelector<HTMLElement>('#plab-message')!;
    const design = document.querySelector<HTMLElement>('#plab-design')!;
    const plotBox = document.querySelector<HTMLElement>('#plab-plot-box')!;
    const showDesign = (designs: HighlightDesign[]) => {
        design.replaceChildren(...designs.map(d => Object.assign(document.createElement('li'), { textContent: describeHighlight(d) })));
        design.parentElement!.hidden = designs.length === 0;
    };

    const say = (text: string, kind: 'ok' | 'error') => {
        message.textContent = text;
        message.className = `lab-message ${kind}`;
    };
    const fail = (text: string) => {
        autkPlot.unregisterPlot(LAB_PLOT);
        draw(null);
        renderChecks(checks, null);
        showDesign([]);
        say(text, 'error');
    };

    // Template whose code the editor was filled with.
    let loaded = 0;
    const loadTemplate = () => {
        const chosen = PLOT_LAB_TEMPLATES[Number(template.value)];
        loaded = Number(template.value);
        code.value = chosen.code;
        recolor();
        columns.value = chosen.columns;
        const fields = transformFields(chosen.transform);
        transform.value = fields.choice;
        options.value = fields.options;
        enableOptions();
        event.value = chosen.event;
        draw(null);
        renderChecks(checks, null);
        showDesign([]);
        // The examples show the least a plain D3 chart needs; the built-in charts also use the optional fields and helpers.
        say(chosen.group === 'example'
            ? 'A plain D3 chart with the least Autark needs: the lines marked // Autark. Edit it and click "Check and draw".'
            : 'The code autk-plot registers for this chart: the same contract, plus optional fields and helpers. Edit it and click "Check and draw".', 'ok');
    };

    const run = () => {
        const chosen = PLOT_LAB_TEMPLATES[Number(template.value)];
        let config: LabPlotConfig;
        try {
            // The chart is titled by the template while its code is unchanged.
            const title = code.value === PLOT_LAB_TEMPLATES[loaded].code ? chosen.chartTitle ?? chosen.title.replace(/ \(.*\)$/, '') : 'Your chart';
            // The axes keep the labels of the page chart while the fields are the template's.
            const axisLabels = columns.value === chosen.columns ? chosen.axisLabels : undefined;
            config = plotLabConfig(columns.value, transformConfigOf(transform.value, options.value), event.value, title, chosen.margins, chosen.topK, axisLabels);
        } catch (error) {
            return fail(`The options are not valid JSON (${(error as Error).message}): keys and text go in double quotes, as in {"bins": 10}.`);
        }
        let definition: PlotDefinition;
        try {
            definition = plotDefinitionOf(code.value);
        } catch (error) {
            return fail(`The code does not run: ${(error as Error).message}`);
        }
        // With no rows the contract holds trivially and nothing is drawn: say so instead.
        if (config.transform && rowsOf(collection, config).length === 0) {
            const given = (config.transform as { options?: Record<string, unknown> }).options ?? {};
            // Names that are not region properties are the likely cause: say which.
            const properties = regionProperties(collection);
            const named = [...(config.attributes?.axis ?? []).filter(field => field !== '@transform'), ...(typeof given.value === 'string' ? [given.value] : [])];
            const unknown = named.filter(field => !properties.includes(field));
            const hint = unknown.length > 0
                ? ` ${unknown.map(field => `"${field}"`).join(', ')} ${unknown.length === 1 ? 'is not a region property' : 'are not region properties'}. Region properties: ${properties.join(', ')}.`
                : given.reducer && given.reducer !== 'count' && !given.value
                    ? ` A reducer other than count needs the property to reduce, such as {"reducer": "${String(given.reducer)}", "value": "shape_leng"}.`
                    : config.transform && ['binning-events', 'reduce-series'].includes(config.transform.preset)
                        ? ' This transform reads a list of events (or a series) per region: name it first in Fields, such as sjoin.collect.noise.'
                        : '';
            return fail(`With these fields and options the transform gives no rows: nothing to draw.${hint}`);
        }

        // Check on a drawing off screen, at the size the chart will be drawn: the width of its box.
        const width = plotBox.clientWidth || CHECK_WIDTH;
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;left:-10000px;top:0;width:${width}px;visibility:hidden`;
        document.body.append(probe);
        const { type, ...checked } = config;
        void type;
        const report = autkPlot.checkPlot(definition, probe, { ...checked, collection, width, height: PLOT_HEIGHT });
        // Marks that all sit at the same place usually read a field that does not exist (the
        // scale gives no position): the contract holds, but the chart shows nothing.
        const boxes = Array.from(probe.querySelectorAll('.autkMark')).map(mark => {
            const box = mark.getBoundingClientRect();
            return [box.x, box.y, box.width, box.height].map(Math.round).join(',');
        });
        // Without a layout (no size anywhere) there is nothing to compare.
        const samePlace = boxes.length > 1 && new Set(boxes).size === 1 && boxes[0] !== '0,0,0,0' && !boxes[0].endsWith(',0,0');
        // With a layout, marks that all have no width or no height draw nothing (a scale given undefined).
        const sized = probe.getBoundingClientRect().width > 0;
        const noSize = sized && boxes.length > 0 && boxes.every(box => { const [, , w, h] = box.split(',').map(Number); return w === 0 || h === 0; });
        probe.remove();

        renderChecks(checks, report, PLOT_INVARIANTS, SKIPPED);
        // The highlight of a refused drawing is not shown: it would not be drawn.
        showDesign(report.violations.length === 0 ? report.designs : []);
        const failure = report.violations.find(v => v.invariant === 0);
        if (failure) {
            // Reading a field the rows lack is the usual cause after a change of transform: say what they have.
            const hint = rowsFields.length > 0 && /undefined|null/.test(failure.message)
                ? ` The rows of this transform have ${rowsFields.join(', ')}: does the code read another field?`
                : '';
            return fail(`The drawing failed: ${plainMessage(failure.message, collection).replace(/\.?$/, '.')}${hint}`);
        }
        if (report.violations.length > 0) {
            draw(null);
            return say('Not drawn: with these violations, selection and the provenance view would not know what each mark stands for.', 'error');
        }

        autkPlot.unregisterPlot(LAB_PLOT);
        try {
            autkPlot.registerPlot(definition);
        } catch (error) {
            return fail(`The registry refused the definition: ${(error as Error).message}`);
        }
        const error = draw(config);
        if (error) return say(`The chart refused the configuration: ${plainMessage(error, collection)}`, 'error');
        const notes = [
            noSize ? ' But no mark has a size, so the chart shows nothing: a field the code reads may not exist in the rows.' : '',
            samePlace && !noSize ? ' Every mark is drawn at the same place: a field may not exist (read fields with value(row, i), which follows nested properties such as sjoin.count.noise).' : '',
            // The person's own code is told about its name; a template is what autk-plot registers.
            code.value === PLOT_LAB_TEMPLATES[loaded].code ? '' : projectNameNote((evaluateChart(code.value) as { name?: unknown }).name, 'chart'),
        ].join('');
        // A chart that shows nothing is not shown as a success, even with the contract met.
        say(`Contract met: linked to the map and the 24 charts (close the drawer to see them).${notes}`, noSize ? 'error' : 'ok');
    };

    // D3 examples, then the code of the built-in charts: a developer's chart is written like them.
    const groups: [PlotLabTemplate['group'], string][] = [['example', 'D3 charts adapted to Autark'], ['built-in', "autk-plot's 24 charts: their own code"]];
    template.replaceChildren(...groups.map(([group, label]) => {
        const optgroup = Object.assign(document.createElement('optgroup'), { label });
        PLOT_LAB_TEMPLATES.forEach((t, index) => { if (t.group === group) optgroup.append(new Option(t.title, String(index))); });
        return optgroup;
    }));
    template.value = '0';
    transform.replaceChildren(
        new Option('None: one row per region', NO_TRANSFORM),
        ...TRANSFORM_CHOICES.map(({ group, choices }) => {
            const optgroup = Object.assign(document.createElement('optgroup'), { label: group });
            optgroup.append(...choices.map(([value, label]) => new Option(label, value)));
            return optgroup;
        }),
    );
    // Another transform takes the options a chart of the page gives it.
    transform.addEventListener('change', () => {
        options.value = optionsOfChoice(transform.value);
        enableOptions();
        // With no transform there is no transform value for a field to read.
        if (transform.value === NO_TRANSFORM) {
            columns.value = columns.value.split(',').map(field => field.trim()).filter(field => field && field !== '@transform').join(', ');
        }
    });
    template.addEventListener('change', () => {
        // Edited code is not replaced without asking.
        if (!mayReplaceCode(code.value !== PLOT_LAB_TEMPLATES[loaded].code)) {
            template.value = String(loaded);
            return;
        }
        loadTemplate();
    });
    document.querySelector('#plab-run')!.addEventListener('click', run);
    loadTemplate();
}
