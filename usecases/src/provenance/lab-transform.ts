/**
 * Try it Yourself (transform): write a transform with provenance in the page,
 * check it against the contract, and draw it linked to every other view.
 *
 * The code runs in this browser only, like code typed in the console: it is
 * evaluated with `new Function` (`lab-scope.ts`, the same scope as the D3
 * chart tab), registered under a fixed name, and checked by
 * `checkTransformReport` on the case study regions. Only a transform that
 * honors all invariants is drawn, by a chart of the page that reads its row
 * shape; otherwise the lab explains which ones broke.
 */

import * as next from '@urban-toolkit/autk-plot';
import type { ContractReport, RowShape, TransformDefinition, UnifiedPlotConfig } from '@urban-toolkit/autk-plot';

import { attachHighlighter } from './code-editor';
import { LAB_TEMPLATES } from './lab-transform-templates';
import type { LabTemplate } from './lab-transform-templates';
import { evaluateChart } from './lab-scope';
import { PLOTS } from './plot';
import type { LinkedPlot } from './plot';
import type { Collection } from './data';

/** Name the lab's transform is registered under; redefining replaces it. */
export const LAB_TRANSFORM = 'try-it-yourself';

/** The contract invariants, in plain words. */
const INVARIANTS: Invariant[] = [
    [1, 'Unique ids', 'One unique id per row'],
    [2, 'Stages', 'Stages D1…Dn in order'],
    [3, 'Relations', 'Relations chained from D0 to the rows, with finite weights ≥ 0'],
    [4, 'Back to regions', 'Following the relations back, each row reaches exactly its autkIds'],
    [5, 'Contributions', 'Contributions link existing regions to existing rows'],
    [6, 'Units add up', 'The units of each row add up to its value (count and sum)'],
];

/** An invariant of a contract: its number, a short name, and the rule in plain words. */
export type Invariant = [number, string, string];

/** Violations listed per invariant; the rest are summarized. */
const SHOWN_VIOLATIONS = 3;

/** Why an invariant was not checked. */
const SKIPPED: Record<number, string> = {
    4: 'not checked: it needs 1 to 3',
    6: 'does not apply: the reducer is not additive',
};

/** Plot config a lab asks the page to draw, without the data; `events[0]` defaults to click. */
export type LabPlotConfig = Omit<UnifiedPlotConfig, 'collection'>;

/**
 * Evaluates lab code as the page does: the body of a function of `d3`,
 * `autk` and `core`.
 *
 * @returns The definition, under the lab's name.
 * @throws If the code does not run or does not return an object.
 */
export function transformDefinitionOf(code: string): TransformDefinition {
    const returned = evaluateChart(code);
    if (!returned || typeof returned !== 'object') throw new Error('The code must end with "return { shape, run }".');
    // registerTransform checks the rest (a known shape, run a function).
    return { ...(returned as TransformDefinition), name: LAB_TRANSFORM };
}

/**
 * Properties of the regions a field can name, nested ones by their path (`sjoin.count.noise`).
 *
 * @param collection Regions of the page.
 * @returns Property paths, in the order of the first region.
 */
export function regionProperties(collection: Collection): string[] {
    const paths = (value: unknown, prefix: string): string[] => Object.entries((value ?? {}) as Record<string, unknown>).flatMap(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return child && typeof child === 'object' && !Array.isArray(child) ? paths(child, path) : [path];
    });
    return paths(collection.features[0]?.properties, '');
}

/**
 * A message of the package in the words of the lab: fields instead of `attributes.axis[i]`, and the
 * region properties when a field names none.
 *
 * @param message Error message of the package.
 * @param collection Regions of the page.
 * @returns The message to show.
 */
export function plainMessage(message: string, collection: Collection): string {
    const plain = message
        .replace(/^PlotBaseData: /, '')
        .replace(/attributes\.axis\[(\d+)\]/g, (_m, index: string) => `field ${Number(index) + 1}`)
        .replace(/attributes\.axis must contain at least one attribute/g, 'the Fields need at least one region property')
        .replace(/attributes\.axis/g, 'the Fields')
        .replace(/attributes\.color/g, 'the color field');
    return /does not exist in the source data/.test(message) ? `${plain} Region properties: ${regionProperties(collection).join(', ')}.` : plain;
}

/**
 * Whether code edited in the lab may be replaced by another template.
 *
 * @param edited Whether the code differs from the loaded template.
 * @returns `true` when nothing is lost, or the person agrees to discard the edits.
 */
export function mayReplaceCode(edited: boolean): boolean {
    return !edited || window.confirm('Discard your changes to the code?') !== false;
}

/**
 * Charts of the page that read rows of a shape: the built-in plots read a
 * user transform by its row shape, as they read the built-in transforms.
 *
 * @param shape Row family of the transform.
 */
export function chartsFor(shape: RowShape): LinkedPlot[] {
    return PLOTS.filter(chart => next.registeredPlot(chart.config.type).transforms?.includes(shape));
}

/**
 * Config of a chart of the page drawing the lab transform: the chart as on
 * the page, reading the given fields through the lab transform.
 *
 * @param chart Chart of the page.
 * @param columns Fields the transform reads.
 * @param options Options of the transform.
 * @param title Title of the drawn chart.
 */
export function transformLabConfig(chart: LinkedPlot, columns: string[], options: Record<string, unknown>, title: string): LabPlotConfig {
    const axis = chart.config.attributes?.axis ?? [];
    return {
        ...chart.config,
        // The value slot stays where the chart has it (axis or color).
        attributes: { ...chart.config.attributes, axis: [...columns, ...(axis.includes('@transform') ? ['@transform'] : [])] },
        transform: { preset: 'registered', name: LAB_TRANSFORM, options },
        labels: { title },
        events: [chart.event],
    };
}

/**
 * Wires the lab controls.
 *
 * @param collection Regions the transform is checked on.
 * @param draw Draws (or, with `null`, removes) the lab plot; returns an error message when the plot refuses the config.
 */
export function setupLab(collection: Collection, draw: (config: LabPlotConfig | null) => string | undefined): void {
    const template = document.querySelector<HTMLSelectElement>('#lab-template')!;
    const code = document.querySelector<HTMLTextAreaElement>('#lab-code')!;
    const recolor = attachHighlighter(code);
    const columns = document.querySelector<HTMLInputElement>('#lab-columns')!;
    // The fields a person can name.
    const fieldsLabel = columns.closest('label');
    if (fieldsLabel) fieldsLabel.title += `. Region properties: ${regionProperties(collection).join(', ')}`;
    const options = document.querySelector<HTMLInputElement>('#lab-options')!;
    const plot = document.querySelector<HTMLSelectElement>('#lab-plot')!;
    const checks = document.querySelector<HTMLElement>('#lab-checks')!;
    const message = document.querySelector<HTMLElement>('#lab-message')!;
    // Whether the current code passed the contract and is drawn.
    let passed = false;

    /** Offers the charts that read a shape, keeping the preferred one when it is among them. */
    const setPlots = (shape: RowShape, preferred: string) => {
        const choices = chartsFor(shape);
        plot.replaceChildren(...choices.map(chart => {
            const title = chart.config.labels?.title;
            const label = next.registeredPlot(chart.config.type).label ?? chart.config.type;
            return new Option(title ? `${label}: ${title}` : label, chart.name);
        }));
        plot.value = choices.some(chart => chart.name === preferred) ? preferred : choices[0]?.name ?? '';
    };
    /** Shape the code declares, read without running its transform. */
    const shapeOf = (source: string): RowShape | undefined => {
        try {
            return (evaluateChart(source) as { shape?: RowShape } | undefined)?.shape;
        } catch {
            return undefined;
        }
    };

    const say = (text: string, kind: 'ok' | 'error') => {
        message.textContent = text;
        message.className = `lab-message ${kind}`;
    };

    const fail = (text: string) => {
        passed = false;
        next.unregisterTransform(LAB_TRANSFORM);
        draw(null);
        renderChecks(checks, null);
        say(text, 'error');
    };

    const chosen = (): LabTemplate => LAB_TEMPLATES[Number(template.value)];
    // Template whose code the editor was filled with.
    let loaded = 0;

    const loadTemplate = () => {
        const current = chosen();
        loaded = Number(template.value);
        code.value = current.code;
        recolor();
        columns.value = current.columns;
        options.value = current.options;
        setPlots(shapeOf(current.code) ?? 'category-value', current.plot);
        passed = false;
        draw(null);
        renderChecks(checks, null);
        say(current.note ?? 'Edit the code and click "Check and draw".', 'ok');
    };

    const run = () => {
        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(options.value || '{}');
        } catch (error) {
            return fail(`The options are not valid JSON: ${(error as Error).message}`);
        }
        const cols = columns.value.split(',').map(col => col.trim()).filter(Boolean);

        // Evaluate the code: it must return { shape, run }.
        let definition: TransformDefinition;
        try {
            definition = transformDefinitionOf(code.value);
        } catch (error) {
            return fail(`The code does not run: ${(error as Error).message}`);
        }
        next.unregisterTransform(LAB_TRANSFORM);
        try {
            next.registerTransform(definition);
        } catch (error) {
            return fail(`The registry refused the definition: ${(error as Error).message}`);
        }

        const report = next.checkTransformReport(definition, collection, parsed, cols);
        renderChecks(checks, report);
        const failure = report.violations.filter(v => v.invariant === 0);
        if (failure.length > 0) {
            const messages = failure.map(v => v.message);
            if (messages.some(m => m.startsWith('run threw'))) return fail(`The transform did not run: ${messages.join('; ')}`);
            const hint = messages.some(m => m.includes('{ rows, provenance }'))
                ? ' Build the provenance with the public blocks, such as binnedProvenance or unnestedProvenance, as the examples do.'
                : '';
            return fail(`The output of run is incomplete for the "${definition.shape}" shape: ${messages.join('; ')}.${hint}`);
        }
        if (report.violations.length > 0) {
            passed = false;
            // A transform that breaks the contract is not left registered for other plots.
            next.unregisterTransform(LAB_TRANSFORM);
            draw(null);
            return say('Not drawn: with these violations, the provenance view would paint the wrong parts.', 'error');
        }

        setPlots(definition.shape, plot.value);
        const chart = PLOTS.find(candidate => candidate.name === plot.value);
        if (!chart) {
            passed = false;
            draw(null);
            return say(`Contract met, but no chart of this page reads the "${definition.shape}" shape.`, 'error');
        }
        // The chart is titled by the template while its code is unchanged.
        const title = code.value === LAB_TEMPLATES[loaded].code ? chosen().title.replace(/ \(.*\)$/, '') : 'Your transform';
        const error = draw(transformLabConfig(chart, cols, parsed, title));
        passed = !error;
        if (error) return say(`The chart refused the output: ${plainMessage(error, collection)}`, 'error');
        // A transform with no rows meets the contract trivially: say so, rather than show an empty chart as a success.
        const source = collection.features.map((feature, index) => ({ ...(feature.properties ?? {}), autkIds: [index] }));
        if (definition.run(source, parsed, cols).rows.length === 0) {
            return say('Contract met, but with these fields and options the transform gives no rows: nothing to draw.', 'error');
        }
        say('Contract met: linked to the map and the 24 charts (close the drawer to see them).', 'ok');
    };

    // Examples, then the code of the built-in transforms: a developer's transform is written like them.
    const groups: [LabTemplate['group'], string][] = [['example', 'Transforms built from the public blocks'], ['built-in', "autk-plot's 12 transforms: their own code"]];
    template.replaceChildren(...groups.map(([group, label]) => {
        const optgroup = Object.assign(document.createElement('optgroup'), { label });
        LAB_TEMPLATES.forEach((t, index) => { if (t.group === group) optgroup.append(new Option(t.title, String(index))); });
        return optgroup;
    }));
    template.value = '0';
    template.addEventListener('change', () => {
        // Edited code is not replaced without asking.
        if (!mayReplaceCode(code.value !== LAB_TEMPLATES[loaded].code)) {
            template.value = String(loaded);
            return;
        }
        loadTemplate();
    });
    document.querySelector('#lab-run')!.addEventListener('click', run);
    // Another chart reads its own fields, as on the page, while the code is the template's (the
    // person's own transform keeps the fields they gave it); a transform that already passed is redrawn.
    plot.addEventListener('change', () => {
        const chart = PLOTS.find(candidate => candidate.name === plot.value);
        if (chart && code.value === LAB_TEMPLATES[loaded].code) {
            columns.value = (chart.config.attributes?.axis ?? []).filter(field => field !== '@transform').join(', ');
        }
        if (passed) run();
    });
    loadTemplate();
}

/**
 * Lists the invariants with ✓, ✗, or why they were not checked.
 *
 * @param invariants Number and plain description of each invariant.
 * @param reasons Why an invariant may be skipped.
 */
export function renderChecks(
    list: HTMLElement,
    report: ContractReport | null,
    invariants: Invariant[] = INVARIANTS,
    reasons: Record<number, string> = SKIPPED,
): void {
    if (!report) {
        list.replaceChildren();
        return;
    }
    list.replaceChildren(...invariants.map(([invariant, name, text]) => {
        const item = document.createElement('li');
        const broken = report.violations.filter(v => v.invariant === invariant);
        const skipped = report.skipped.includes(invariant) && broken.length === 0;
        item.className = broken.length > 0 ? 'fail' : skipped ? 'skip' : 'pass';
        // A compact chip; the rule and why it was skipped show on hover, failures in full.
        item.title = `${invariant}. ${text}${skipped ? ` (${reasons[invariant] ?? 'not checked'})` : ''}`;
        const mark = document.createElement('span');
        mark.className = 'check-mark';
        mark.textContent = broken.length > 0 ? '✗' : skipped ? '–' : '✓';
        const label = document.createElement('span');
        label.textContent = broken.length > 0 ? `${invariant}. ${text}` : `${invariant} ${name}`;
        item.append(mark, label);
        if (broken.length > 0) {
            const details = document.createElement('ul');
            const lines = broken.slice(0, SHOWN_VIOLATIONS).map(v => v.message);
            if (broken.length > SHOWN_VIOLATIONS) lines.push(`… and ${broken.length - SHOWN_VIOLATIONS} more of the same problem`);
            details.append(...lines.map(text => {
                const line = document.createElement('li');
                line.textContent = text;
                return line;
            }));
            item.append(details);
        }
        return item;
    }));
}
