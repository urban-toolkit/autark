/**
 * Try it Yourself (D3 chart): write a chart in plain D3, check its annotations
 * against the drawing contract, and draw it linked to every other view.
 *
 * Like the transform tab, the code runs in this browser only: it is evaluated
 * with `new Function` (`lab-scope.ts`), checked by `checkPlot` on the case study regions, and drawn
 * as `{ type: 'registered' }` only when every invariant holds.
 */

import * as next from '@urban-toolkit/autk-plot';
import type { AutkDatum, PartialDesign, PlotDefinition, PlotTransformConfig, TopKConfig, TransformDefinition } from '@urban-toolkit/autk-plot';

import { attachHighlighter } from './code-editor';
import { PLOT_HEIGHT } from './config';
import { BUILT_IN_TRANSFORM_TEMPLATES } from './lab-builtin-templates';
import { movingAverage } from './moving-average';
import { mayReplaceCode, plainMessage, regionProperties, renderChecks } from './lab-transform';
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
const LAB_EVENTS: Record<string, next.PlotEvent> = {
    click: next.PlotEvent.CLICK,
    brush: next.PlotEvent.BRUSH,
    'brush-x': next.PlotEvent.BRUSH_X,
    'brush-y': next.PlotEvent.BRUSH_Y,
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
        return next.run(source, config.transform!, fields).rows;
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
        events: [LAB_EVENTS[event] ?? next.PlotEvent.CLICK],
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
    const enableOptions = () => {
        options.disabled = transform.value === NO_TRANSFORM;
        // The fields of the rows the drawing receives, from the shape the transform declares.
        if (!rowsHint) return;
        const config = transformConfigOf(transform.value, '');
        const name = config ? (config.preset === 'registered' ? (config as { name: string }).name : config.preset) : '';
        const fields = name ? next.shapeFields(next.registeredTransform(name).shape) : [];
        rowsHint.textContent = fields.length > 0
            ? `rows: ${fields.slice(0, 6).join(', ')}${fields.length > 6 ? ', …' : ''}`
            : 'rows: one per region, with its properties';
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
            ? 'A plain D3 chart with the least Autark needs: the highlighted lines. Edit it and click "Check and draw".'
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
            return fail(`The options are not valid: ${(error as Error).message}`);
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
        const report = next.checkPlot(definition, probe, { ...checked, collection, width, height: PLOT_HEIGHT });
        probe.remove();

        renderChecks(checks, report, PLOT_INVARIANTS, SKIPPED);
        // The partial view of a refused drawing is not shown: it would not be drawn.
        showDesign(report.violations.length === 0 ? report.designs : []);
        const failure = report.violations.find(v => v.invariant === 0);
        if (failure) return fail(`The drawing failed: ${plainMessage(failure.message, collection)}`);
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
        if (error) return say(`The chart refused the configuration: ${plainMessage(error, collection)}`, 'error');
        say('Contract met: linked to the map and the 24 charts (close the drawer to see them).', 'ok');
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
