/**
 * The workspace around the plots: chart cards, the toolbox, the transforms
 * and Try it Yourself drawers, and the page settings.
 */

import * as next from '@urban-toolkit/autk-plot';
import type { TransformReducer } from '@urban-toolkit/autk-plot';

import type { ProvenanceApp } from './app';
import { CHARTS, TRANSFORMS, chartsByTransform } from './catalog';
import type { TransformEntry } from './catalog';
import { FILTERS } from './config';
import { icon } from './icons';
import { setupPlotLab } from './lab-plot';
import { setupLab } from './lab-transform';
import { LAB_TEMPLATES } from './lab-transform-templates';
import { PLOTS } from './plot';
import { clearError, reportError } from '../shared/ui';

/** Name of the event a plot listens to, as shown on its card. */
const INTERACTIONS: Record<string, string> = { click: 'click', brush: 'brush', brushX: 'brush x', brushY: 'brush y' };
/** What each interaction chip means. */
const INTERACTION_HINTS: Record<string, string> = {
    click: 'Click a mark to select it, and again to take it out. After a selection made elsewhere, a click works on whole marks of this chart: those that selection reached, plus or minus the clicked one. Click the background to clear',
    brush: 'Drag a rectangle to select; click the background to clear',
    brushX: 'Drag horizontally to select; click the background to clear',
    brushY: 'Drag vertically to select; click the background to clear',
};
/** What each cardinality chip means: how regions relate to the marks of the chart. */
const RELATION_HINTS: Record<string, string> = {
    '1:1': 'Each mark is one region',
    'N:1': 'Each mark gathers several regions',
    '1:N': 'Each region spreads over several marks',
    'N:N': 'A region reaches several marks, and a mark gathers several regions',
};
/** Key of the relation codes of the provenance model, as in the report. */
const RELATION_KEY = 'Relation types of the provenance model: R1 identity (1:1), R2 partition (N:1), R3 unnest (1:N), '
    + 'R4 unnest and partition (N:N), R5 chained partition, R6 unnest by attribute, R7 accumulation, R8 pairs by attribute, '
    + 'R9 partition with roles, R10 fractional coverage (real weights), R11 exclusion (filter, top-k)';

/** Fills every `[data-icon]` placeholder with its SVG. */
function drawIcons(root: ParentNode): void {
    root.querySelectorAll<HTMLElement>('[data-icon]').forEach(element => {
        if (!element.querySelector('svg')) element.insertAdjacentHTML('afterbegin', icon(element.dataset.icon!));
    });
}

/**
 * Builds the chart cards and their toolbox buttons. Runs before the app
 * loads, since the plots are drawn into these cards.
 */
export function buildWorkspace(): void {
    const grid = document.querySelector<HTMLElement>('#charts')!;
    const tools = document.querySelector<HTMLElement>('#chart-tools')!;

    for (const plot of PLOTS) {
        const id = plot.div.slice(1);
        const chart = CHARTS[id];
        const card = document.createElement('article');
        card.className = 'card';
        card.id = `card-${id}`;
        card.innerHTML = `
            <div class="card-head">
                <span class="icon" data-icon="${chart.icon}"></span>
                <h3>${chart.title}</h3>
                <span class="chips">
                    <span class="chip relation" title="Cardinality ${chart.relation}: ${RELATION_HINTS[chart.relation] ?? 'regions per mark'}">${chart.relation}</span>
                    <span class="chip interaction" title="${INTERACTION_HINTS[plot.event] ?? 'How to select'}">${INTERACTIONS[plot.event] ?? plot.event}</span>
                </span>
            </div>
            <div class="card-body${id === 'table' ? ' table-box' : ''}" id="${id}"></div>`;
        grid.append(card);

        const tool = document.createElement('button');
        tool.type = 'button';
        tool.className = 'tool';
        tool.dataset.target = card.id;
        tool.dataset.label = chart.title;
        tool.dataset.icon = chart.icon;
        tools.append(tool);
    }
    document.querySelectorAll<HTMLElement>('.tool[data-label]').forEach(tool => {
        tool.setAttribute('aria-label', tool.dataset.label!);
    });
    drawIcons(document);
    setupToolTips();
}

/**
 * Shows the name of a tool beside it on hover or keyboard focus. The tooltip
 * is measured from the tool itself, so it follows the toolbox when it scrolls.
 */
function setupToolTips(): void {
    const tip = document.createElement('div');
    tip.className = 'tool-tip';
    tip.setAttribute('aria-hidden', 'true');
    document.body.append(tip);

    const hide = (): void => tip.classList.remove('visible');
    const show = (event: Event): void => {
        const tool = (event.target as HTMLElement).closest<HTMLElement>('.tool[data-label]');
        if (!tool) return hide();
        const box = tool.getBoundingClientRect();
        tip.textContent = tool.dataset.label!;
        tip.style.left = `${box.right + 6}px`;
        tip.style.top = `${box.top + box.height / 2}px`;
        tip.classList.add('visible');
    };

    const toolbox = document.querySelector<HTMLElement>('#toolbox')!;
    toolbox.addEventListener('pointerover', show);
    toolbox.addEventListener('focusin', show);
    toolbox.addEventListener('pointerleave', hide);
    toolbox.addEventListener('focusout', hide);
    toolbox.addEventListener('scroll', hide);
}

/** Scrolls to a card or pane; a card keeps an outline until a click outside it. */
function reveal(id: string): void {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (target.classList.contains('card')) target.classList.add('focus');
}

// A click outside the outlined card (another tool included) removes its outline; a click on the
// card itself, such as a selection in its chart, keeps it. The pointer goes down before the
// click that may outline another card.
document.addEventListener('pointerdown', event => {
    document.querySelectorAll('.card.focus').forEach(card => {
        if (!card.contains(event.target as Node)) card.classList.remove('focus');
    });
});

/** Element focused before a drawer opened, to get the focus back when it closes. */
let drawerOpener: HTMLElement | null = null;

/** Opens one drawer (closing the others), or closes it when it is already open. */
function toggleDrawer(id: string, force?: boolean): void {
    const wasOpen = document.querySelector('.drawer.open') !== null;
    let opened: HTMLElement | null = null;
    document.querySelectorAll<HTMLElement>('.drawer').forEach(drawer => {
        const open = drawer.id === id && (force ?? !drawer.classList.contains('open'));
        if (open && !drawer.classList.contains('open')) opened = drawer;
        drawer.classList.toggle('open', open);
        drawer.setAttribute('aria-hidden', String(!open));
    });
    syncActiveTools();
    if (opened) {
        if (!wasOpen) drawerOpener = document.activeElement as HTMLElement | null;
        // Focus the selected tab, or the close button of a drawer without tabs.
        const drawer = opened as HTMLElement;
        (drawer.querySelector<HTMLElement>('.tab[aria-selected="true"]') ?? drawer.querySelector<HTMLElement>('[data-close]'))?.focus();
    } else if (wasOpen && !document.querySelector('.drawer.open')) {
        if (drawerOpener?.isConnected) drawerOpener.focus();
        drawerOpener = null;
    }
}

/** Marks the tools of the open drawer. */
function syncActiveTools(): void {
    document.querySelectorAll<HTMLElement>('.tool[data-drawer]').forEach(tool => {
        tool.classList.toggle('active', document.getElementById(tool.dataset.drawer!)?.classList.contains('open') ?? false);
    });
}

/** Shows one Try it Yourself tab; only the selected tab is in the tab order. */
function showTab(name: string): void {
    document.querySelectorAll<HTMLElement>('#try-drawer .tab').forEach(tab => {
        const selected = tab.dataset.tab === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll<HTMLElement>('#try-drawer .lab').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
}

/** Applies a page setting; a chart that fails reports it instead of stopping the page. */
function applySetting(apply: () => void): void {
    try {
        apply();
        clearError();
    } catch (error) {
        reportError(error);
    }
}

/** Groups of the transforms drawer: all are registered definitions, by the package or by this page. */
const TRANSFORM_GROUPS: [TransformEntry['origin'], string][] = [
    ['built-in', "autk-plot's 12 transforms"],
    ['page', 'Registered by this page (registerTransform)'],
];

/** Opens Try it Yourself on the Transform tab, with the code of a built-in transform. */
function showTransformCode(name: string): void {
    const index = LAB_TEMPLATES.findIndex(template => template.name === name);
    if (index < 0) return;
    toggleDrawer('try-drawer', true);
    showTab('transform');
    const select = document.querySelector<HTMLSelectElement>('#lab-template')!;
    select.value = String(index);
    select.dispatchEvent(new Event('change'));
    document.querySelector<HTMLElement>('#tab-transform')!.focus();
}

/**
 * Lists the transforms, in the groups that registered them, with what the
 * registry says of each (label and row shape); picking one highlights the
 * charts of the page that use it.
 */
function buildTransforms(): void {
    const list = document.querySelector<HTMLElement>('#transform-list')!;
    const grid = document.querySelector<HTMLElement>('#charts')!;
    const users = chartsByTransform();

    for (const [origin, heading] of TRANSFORM_GROUPS) {
        list.append(Object.assign(document.createElement('li'), { className: 'transform-group', textContent: heading }));
        for (const entry of TRANSFORMS.filter(candidate => candidate.origin === origin)) appendTransform(list, grid, entry, users.get(entry.name) ?? []);
    }
}

/** Unpicks the transform of the drawer, if any, and stops highlighting its charts. */
function clearTransformPick(): void {
    document.querySelectorAll('#transform-list .transform').forEach(item => {
        item.classList.remove('active');
        item.setAttribute('aria-pressed', 'false');
    });
    const grid = document.querySelector<HTMLElement>('#charts')!;
    grid.classList.remove('filtering');
    grid.querySelectorAll('.card.match').forEach(card => card.classList.remove('match'));
}

/** One transform of the drawer: a toggle that highlights the charts using it. */
function appendTransform(list: HTMLElement, grid: HTMLElement, entry: TransformEntry, charts: string[]): void {
    const { label, shape } = next.registeredTransform(entry.name);
    const code = LAB_TEMPLATES.some(template => template.name === entry.name);
    const item = document.createElement('li');
    item.className = 'transform';
    item.innerHTML = `
        <div class="transform-head">
            <span class="transform-name">${entry.name}</span>
            <span class="transform-label">${label ?? ''}</span>
        </div>
        <div class="transform-facts">
            <span class="chip" title="Row shape: a chart that reads this shape reads any transform that gives it, built-in or not">rows: ${shape}</span>
            <span class="transform-relations" title="${RELATION_KEY}">${entry.relations}</span>
        </div>
        <p>${entry.description}</p>
        <div class="used-by">${charts.length
            ? charts.map(id => `<button type="button" data-card="card-${id}">${CHARTS[id].title}</button>`).join('')
            : '<span class="none">Not used by a chart of this page.</span>'}${code
            ? '<button type="button" class="see-code" data-code>See the code</button>'
            : ''}</div>`;
    const toggle = () => {
        const active = !item.classList.contains('active');
        clearTransformPick();
        if (!active) return;
        item.classList.add('active');
        item.setAttribute('aria-pressed', 'true');
        grid.classList.add('filtering');
        grid.querySelectorAll('.card').forEach(card => card.classList.toggle('match', charts.includes(card.id.slice('card-'.length))));
        // The drawer covers the right column: it closes, and the first chart that uses the transform comes into view.
        if (charts.length === 0) return;
        toggleDrawer('', false);
        document.getElementById(`card-${charts[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    // The item is a toggle for the keyboard too; its chart chips stay their own buttons.
    item.tabIndex = 0;
    item.setAttribute('aria-pressed', 'false');
    item.addEventListener('click', event => {
        const target = event.target as HTMLElement;
        const chip = target.closest<HTMLElement>('[data-card]');
        if (chip) reveal(chip.dataset.card!);
        else if (target.closest('[data-code]')) showTransformCode(entry.name);
        else toggle();
    });
    item.addEventListener('keydown', event => {
        if (event.target !== item || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        toggle();
    });
    list.append(item);
}

/**
 * Wires the page controls to the app.
 *
 * @param app The loaded case study.
 */
export function initUi(app: ProvenanceApp): void {
    const filter = document.querySelector<HTMLSelectElement>('#filter')!;
    const reducer = document.querySelector<HTMLSelectElement>('#reducer')!;

    if (!app.hasMap) {
        document.querySelector<HTMLCanvasElement>('#map')!.hidden = true;
        document.querySelector<HTMLElement>('.map-hint')!.hidden = true;
        const message = document.querySelector<HTMLElement>('#map-status')!;
        message.hidden = false;
        message.textContent = 'The map needs WebGPU, which this browser does not offer. The charts stay linked to each other.';
    }

    // The page starts with every setting at its default, whatever the browser restored.
    reducer.value = 'count';
    filter.append(...FILTERS.map(({ label }, index) => new Option(`Filter: ${label}`, String(index))));
    filter.value = '';
    filter.addEventListener('change', () => applySetting(() => app.configure({ filter: filter.value === '' ? null : FILTERS[Number(filter.value)].condition })));
    reducer.addEventListener('change', () => applySetting(() => app.configure({ reducer: reducer.value as TransformReducer })));
    document.querySelector('#clear')!.addEventListener('click', () => {
        clearTransformPick();
        applySetting(() => app.clear());
    });

    // Tools: charts and the map scroll into view (the map also resets its camera);
    // the other tools (and the top button) open drawers.
    document.addEventListener('click', event => {
        const tool = (event.target as HTMLElement).closest<HTMLElement>('.tool, .try-button');
        if (!tool) return;
        if (tool.dataset.target) {
            toggleDrawer('', false);
            reveal(tool.dataset.target);
            if (tool.dataset.target === 'map-pane') app.resetMapView();
        } else if (tool.dataset.drawer) {
            toggleDrawer(tool.dataset.drawer);
        }
    });
    document.querySelectorAll<HTMLElement>('[data-close]').forEach(button => button.addEventListener('click', () => toggleDrawer('', false)));
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('#try-drawer .tab'));
    tabs.forEach(tab => {
        tab.addEventListener('click', () => showTab(tab.dataset.tab!));
        // Arrow keys move between tabs, as in any tab list.
        tab.addEventListener('keydown', event => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            const next = tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            showTab(next.dataset.tab!);
            next.focus();
        });
    });
    document.addEventListener('keydown', event => {
        // Escape closes the drawer, from the code too (it is kept); in a list it closes the list.
        // With no drawer open, it unpicks the transform whose charts are highlighted.
        if (event.key !== 'Escape' || (event.target as HTMLElement).closest('select')) return;
        if (!document.querySelector('.drawer.open')) clearTransformPick();
        toggleDrawer('', false);
    });
    buildTransforms();

    setupLab(app.collection, config => app.setLabPlot(0, config));
    setupPlotLab(app.collection, config => app.setLabPlot(1, config));
}
