/**
 * Try it Yourself (transform): write a transform with provenance in the page,
 * check it against the contract, and draw it linked to every other view.
 *
 * The code runs in this browser only, like code typed in the console: it is
 * evaluated with `new Function`, registered under a fixed name, and checked by
 * `checkTransformReport` on the case study regions. Only a transform that honors all
 * invariants is drawn; otherwise the lab explains which ones broke.
 */

import * as next from '@urban-toolkit/autk-plot';
import type { ContractReport, RowShape, TransformDefinition, UnifiedPlotConfig } from '@urban-toolkit/autk-plot';

import { attachHighlighter } from './code-editor';
import { LAB_TEMPLATES } from './lab-transform-templates';
import type { Collection } from './data';

/** Name the lab's transform is registered under; redefining replaces it. */
export const LAB_TRANSFORM = 'try-it-yourself';

/** Building blocks handed to the lab code as `lib`. */
export const LIB = {
    collectBuckets: next.collectBuckets,
    binnedProvenance: next.binnedProvenance,
    unnestedProvenance: next.unnestedProvenance,
    cumulativeProvenance: next.cumulativeProvenance,
    hierarchyProvenance: next.hierarchyProvenance,
    indexedBins: next.indexedBins,
    featureId: next.featureId,
};

/** Plots that read each row shape. */
const PLOTS_BY_SHAPE: Record<RowShape, { type: string; label: string }[]> = {
    'category-value': [
        { type: 'barchart', label: 'Bars' },
        { type: 'pie', label: 'Pie' },
        { type: 'donut', label: 'Donut' },
    ],
    series: [
        { type: 'linechart', label: 'Line' },
        { type: 'areachart', label: 'Area' },
    ],
};

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
    const options = document.querySelector<HTMLInputElement>('#lab-options')!;
    const plot = document.querySelector<HTMLSelectElement>('#lab-plot')!;
    const checks = document.querySelector<HTMLElement>('#lab-checks')!;
    const message = document.querySelector<HTMLElement>('#lab-message')!;
    // Whether the current code passed the contract and is drawn.
    let passed = false;

    const setPlots = (shape: RowShape, preferred: string) => {
        const choices = PLOTS_BY_SHAPE[shape];
        plot.replaceChildren(...choices.map(choice => new Option(choice.label, choice.type)));
        plot.value = choices.some(choice => choice.type === preferred) ? preferred : choices[0].type;
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

    const loadTemplate = () => {
        const chosen = LAB_TEMPLATES[Number(template.value)];
        code.value = chosen.code;
        recolor();
        columns.value = chosen.columns;
        options.value = chosen.options;
        setPlots(chosen.code.includes("shape: 'series'") ? 'series' : 'category-value', chosen.plot);
        passed = false;
        draw(null);
        renderChecks(checks, null);
        say('Edit the code and click "Check and draw".', 'ok');
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
        let returned: Partial<TransformDefinition>;
        try {
            returned = new Function('lib', code.value)(LIB);
        } catch (error) {
            return fail(`The code does not run: ${(error as Error).message}`);
        }
        if (!returned || typeof returned !== 'object') {
            return fail('The code must end with "return { shape, run }".');
        }
        const definition = { ...returned, name: LAB_TRANSFORM } as TransformDefinition;
        next.unregisterTransform(LAB_TRANSFORM);
        try {
            next.registerTransform(definition);
        } catch (error) {
            return fail(`The registry refused the definition: ${(error as Error).message}`);
        }

        const report = next.checkTransformReport(definition, collection, parsed, cols);
        renderChecks(checks, report);
        const failure = report.violations.find(v => v.invariant === 0);
        if (failure) return fail(`The transform failed to run: ${failure.message}`);
        if (report.violations.length > 0) {
            passed = false;
            // A transform that breaks the contract is not left registered for other plots.
            next.unregisterTransform(LAB_TRANSFORM);
            draw(null);
            return say('Not drawn: with these violations, the provenance view would paint the wrong parts.', 'error');
        }

        setPlots(definition.shape, plot.value);
        const error = draw({
            type: plot.value as LabPlotConfig['type'],
            attributes: { axis: [...cols, '@transform'] },
            transform: { preset: 'registered', name: LAB_TRANSFORM, options: parsed },
            labels: { title: LAB_TEMPLATES[Number(template.value)]?.title.replace(/ \(.*\)$/, '') ?? 'Try it Yourself' },
        });
        passed = !error;
        if (error) return say(`The chart refused the output: ${error}`, 'error');
        say('Contract met: linked to the map and the 24 charts.', 'ok');
    };

    template.replaceChildren(...LAB_TEMPLATES.map((t, index) => new Option(t.title, String(index))));
    template.addEventListener('change', loadTemplate);
    document.querySelector('#lab-run')!.addEventListener('click', run);
    // Changing the plot redraws a transform that already passed.
    plot.addEventListener('change', () => {
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
