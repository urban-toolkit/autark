/**
 * Compact provenance path widget drawn under a plot.
 *
 * A small toggle button with a path icon opens a row of stage chips
 * (`D0 → D1 → D2 → M`), each showing how many entities the current selection
 * reaches in that stage, with relation cardinalities between them. The row
 * wraps on narrow containers.
 */

import * as d3 from 'd3';

import type { ProvenanceCardinality, ProvenancePath } from '../types-provenance';

import { PlotStyle } from '../plot-style';

/** State rendered by the provenance path widget. */
export type ProvenancePathViewState = {
    /** Whether the path row is expanded. */
    open: boolean;
    /** Query direction, or `null` when nothing is selected. */
    direction: 'direct' | 'inverse' | null;
    /** Stages reached by the selection, in query order. */
    path: ProvenancePath;
    /** Cardinality of each relation, keyed by `source→target` stage names. */
    cardinalities: Map<string, ProvenanceCardinality>;
    /** Short descriptions of the mark parts drawn by the segregated view. */
    parts: string[];
    /** Explanations of entities the selection loses along the path (e.g. excluded by a filter). */
    notes: string[];
    /** Maximum width of the widget in pixels, usually the plot width. */
    width: number;
    /** Called when the toggle button is pressed. */
    onToggle: () => void;
};

/** Maximum number of ids listed in a chip tooltip. */
const MAX_TOOLTIP_IDS = 40;

/**
 * Clicking mouse pointer icon, drawn with the current text color.
 *
 * Path data from Lucide's `mouse-pointer-click` (ISC License, https://lucide.dev).
 * The inline size wins over page rules such as `svg { width: 100% }`, which
 * the Autark gallery uses to stretch the plot SVG.
 */
const ICON = '<svg width="14" height="14" style="width:14px;height:14px;flex:none"'
    + ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
    + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
    + '<path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/>'
    + '<path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739'
    + 'l-1.04 4.35a.5.5 0 0 1-.95.074z"/></svg>';

/** Swaps the sides of a cardinality, for relations read backwards. */
function transposeCardinality(cardinality: ProvenanceCardinality): ProvenanceCardinality {
    if (cardinality === 'N:1') return '1:N';
    if (cardinality === '1:N') return 'N:1';
    return cardinality;
}

/** Cardinality of the step between two displayed stages, in display order. */
function stepCardinality(state: ProvenancePathViewState, from: string, to: string): string {
    // Relations to `M` may start at several stages, keyed like `D1+D2→M`.
    for (const [key, cardinality] of state.cardinalities) {
        const [sources, target] = key.split('→');
        const sourceList = sources.split('+');
        if (target === to && sourceList.includes(from)) return cardinality;
        if (target === from && sourceList.includes(to)) return transposeCardinality(cardinality);
    }
    return '';
}

/** Lists ids for a tooltip, truncated to `MAX_TOOLTIP_IDS`. */
function tooltip(ids: string[]): string {
    if (ids.length <= MAX_TOOLTIP_IDS) return ids.join('\n');
    return `${ids.slice(0, MAX_TOOLTIP_IDS).join('\n')}\n… +${ids.length - MAX_TOOLTIP_IDS}`;
}

/**
 * Renders, updates, or removes the provenance path widget of a plot.
 *
 * @param host Plot host element; the widget is appended after the plot content.
 * @param state Widget state, or `null` to remove the widget.
 */
export function renderProvenancePathView(host: HTMLElement, state: ProvenancePathViewState | null): void {
    const root = d3.select(host)
        .selectAll<HTMLDivElement, ProvenancePathViewState>(':scope > .autk-provenance')
        .data(state ? [state] : [])
        .join('div')
        .attr('class', 'autk-provenance')
        .style('width', (s) => `${s.width}px`)
        .style('max-width', '100%')
        .style('box-sizing', 'border-box')
        .style('margin', '4px 0 0')
        .style('font', '11px/1.4 system-ui, sans-serif')
        .style('color', '#57606a')
        .style('text-align', 'center')
        // One outline for the whole widget: it grows downward when the path opens.
        .style('border', (s) => `1px solid ${s.open ? PlotStyle.provenance : '#d0d7de'}`)
        .style('border-radius', '4px')
        .style('background', (s) => s.open ? `${PlotStyle.provenance}14` : 'transparent');

    if (!state) return;

    const active = state.direction !== null;
    const stages = state.path;
    const summary = active
        ? `${stages.map((step) => step.ids.length).join(' → ')} · ${state.direction}`
        : 'no selection';

    // ---- Toggle bar, as wide as the plot
    root.selectAll<HTMLButtonElement, ProvenancePathViewState>('.autk-provenance-toggle')
        .data([state])
        .join('button')
        .attr('class', 'autk-provenance-toggle')
        .attr('type', 'button')
        .attr('title', 'Provenance path')
        .attr('aria-expanded', (s) => String(s.open))
        .style('display', 'flex')
        .style('width', '100%')
        .style('justify-content', 'center')
        .style('align-items', 'center')
        .style('gap', '6px')
        .style('padding', '3px 8px')
        .style('border', 'none')
        .style('background', 'transparent')
        .style('color', active ? PlotStyle.provenanceStroke : '#8c959f')
        .style('font', 'inherit')
        .style('cursor', 'pointer')
        .html(`${ICON}<span>Provenance</span><span style="color:#8c959f">${summary}</span>`)
        .on('click', (_event, s) => s.onToggle());

    // ---- Path panel: stage chips first, then notes and mark parts
    const row = root.selectAll<HTMLDivElement, ProvenancePathViewState>('.autk-provenance-path')
        .data(state.open ? [state] : [])
        .join('div')
        .attr('class', 'autk-provenance-path')
        .style('margin', '0 8px')
        .style('padding', '6px 0')
        // Thin separator between the title and the content.
        .style('border-top', `1px solid ${PlotStyle.provenance}66`);

    const chips = row.selectAll<HTMLDivElement, ProvenancePathViewState>('.autk-provenance-chips')
        .data((s) => [s])
        .join('div')
        .attr('class', 'autk-provenance-chips')
        .style('display', 'flex')
        .style('flex-wrap', 'wrap')
        .style('justify-content', 'center')
        .style('align-items', 'center')
        .style('gap', '4px 6px');

    const items: { kind: 'stage' | 'step'; text: string; detail?: string; ids?: string[] }[] = [];
    stages.forEach((step, index) => {
        if (index > 0) {
            items.push({ kind: 'step', text: '→', detail: stepCardinality(state, stages[index - 1].stage, step.stage) });
        }
        items.push({ kind: 'stage', text: step.stage, detail: `${step.label} ${step.ids.length}`, ids: step.ids });
    });

    chips.selectAll<HTMLSpanElement, (typeof items)[number]>('span.autk-provenance-item')
        .data(active ? items : [])
        .join('span')
        .attr('class', (d) => `autk-provenance-item autk-provenance-${d.kind}`)
        .attr('title', (d) => d.ids ? tooltip(d.ids) : null)
        .style('display', 'inline-flex')
        .style('align-items', 'baseline')
        .style('gap', '4px')
        .style('padding', (d) => d.kind === 'stage' ? '1px 6px' : '0')
        .style('border', (d) => d.kind === 'stage' ? '1px solid #e1e4e8' : 'none')
        .style('border-radius', '3px')
        .style('background', (d) => d.kind === 'stage' && (d.ids?.length ?? 0) > 0 ? '#f6f8fa' : 'transparent')
        .html((d) => d.kind === 'stage'
            ? `<strong style="color:${PlotStyle.provenanceStroke}">${stageName(d.text)}</strong><span>${d.detail}</span>`
            : `<span>${d.text}</span><span style="font-size:10px">${d.detail}</span>`);

    const lines = active ? [...state.notes, ...(state.parts.length > 0 ? [state.parts.join(' · ')] : [])]
        : ['Select marks here or in a linked view.'];
    row.selectAll<HTMLDivElement, string>('.autk-provenance-parts')
        .data(lines)
        .join('div')
        .attr('class', (_d, i) => i < (active ? state.notes.length : 0) ? 'autk-provenance-parts autk-provenance-note' : 'autk-provenance-parts')
        .style('margin-top', '4px')
        .style('color', (_d, i) => i < (active ? state.notes.length : 0) ? '#9a6700' : '#8c959f')
        .text((d) => d);
}

/**
 * Formats a stage name with its index as a subscript, e.g. `D0` → D₀.
 *
 * @param name Stage name such as `D0`, `D12`, or `M`.
 * @returns HTML for the stage name.
 */
function stageName(name: string): string {
    return name.replace(/^D(\d+)$/, 'D<sub>$1</sub>');
}
