/**
 * The workspace around the plots: chart cards, the toolbox, the transforms
 * and Try it Yourself drawers, and the page settings.
 */

import type { TransformReducer } from '@urban-toolkit/autk-plot';

import type { ProvenanceApp } from './app';
import { CHARTS, TRANSFORMS, chartsByTransform } from './catalog';
import { FILTERS } from './config';
import { icon } from './icons';
import { setupPlotLab } from './lab-plot';
import { setupLab } from './lab-transform';
import { PLOTS } from './plot';
import { clearError, reportError } from '../shared/ui';

/** Name of the event a plot listens to, as shown on its card. */
const INTERACTIONS: Record<string, string> = { click: 'click', brush: 'brush', brushX: 'brush x', brushY: 'brush y' };

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
                    <span class="chip relation" title="Cardinality">${chart.relation}</span>
                    <span class="chip interaction" title="How to select">${INTERACTIONS[plot.event] ?? plot.event}</span>
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
        tool.setAttribute('aria-label', chart.title);
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

/** Scrolls to a card or pane and outlines it for a moment. */
function reveal(id: string): void {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!target.classList.contains('card')) return;
    target.classList.add('focus');
    window.setTimeout(() => target.classList.remove('focus'), 1600);
}

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

/** Lists the transforms; picking one highlights the charts that use it. */
function buildTransforms(): void {
    const list = document.querySelector<HTMLElement>('#transform-list')!;
    const grid = document.querySelector<HTMLElement>('#charts')!;
    const users = chartsByTransform();

    for (const entry of TRANSFORMS) {
        const charts = users.get(entry.name) ?? [];
        const item = document.createElement('li');
        item.className = 'transform';
        item.innerHTML = `
            <div><span class="transform-name">${entry.name}</span><span class="transform-relations">${entry.relations}</span></div>
            <p>${entry.description}</p>
            <div class="used-by">${charts.length
                ? charts.map(id => `<button type="button" data-card="card-${id}">${CHARTS[id].title}</button>`).join('')
                : '<span class="none">Available in the package; not used on this page.</span>'}</div>`;
        const toggle = () => {
            const active = !item.classList.contains('active');
            list.querySelectorAll('.transform').forEach(other => {
                other.classList.remove('active');
                other.setAttribute('aria-pressed', 'false');
            });
            item.classList.toggle('active', active);
            item.setAttribute('aria-pressed', String(active));
            grid.classList.toggle('filtering', active);
            grid.querySelectorAll('.card').forEach(card => card.classList.toggle('match', active && charts.includes(card.id.slice('card-'.length))));
        };
        // The item is a toggle for the keyboard too; its chart chips stay their own buttons.
        item.tabIndex = 0;
        item.setAttribute('aria-pressed', 'false');
        item.addEventListener('click', event => {
            const chip = (event.target as HTMLElement).closest<HTMLElement>('[data-card]');
            if (chip) reveal(chip.dataset.card!);
            else toggle();
        });
        item.addEventListener('keydown', event => {
            if (event.target !== item || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            toggle();
        });
        list.append(item);
    }
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

    filter.append(...FILTERS.map(({ label }, index) => new Option(`Filter: ${label}`, String(index))));
    // The page starts with every setting at its default, whatever the browser restored.
    reducer.value = 'count';
    filter.append(...FILTERS.map(({ label }, index) => new Option(`Filter: ${label}`, String(index))));
    filter.value = '';
    filter.addEventListener('change', () => applySetting(() => app.configure({ filter: filter.value === '' ? null : FILTERS[Number(filter.value)].condition })));
    reducer.addEventListener('change', () => applySetting(() => app.configure({ reducer: reducer.value as TransformReducer })));
    document.querySelector('#clear')!.addEventListener('click', () => applySetting(() => app.clear()));

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
        // Escape inside the code or a field belongs to that field, not to the drawer.
        if (event.key !== 'Escape' || (event.target as HTMLElement).closest('textarea, input, select')) return;
        toggleDrawer('', false);
    });
    buildTransforms();

    setupLab(app.collection, config => app.setLabPlot(0, config));
    setupPlotLab(app.collection, config => app.setLabPlot(1, config));
}
