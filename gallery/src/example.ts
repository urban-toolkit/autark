import { examples, modules, sections, externalServices } from '../catalog';
import { exampleCode } from '../code';
import { exampleSource } from '../source';
import { highlightTypeScript } from '../highlight';

const example = examples.find(item => location.pathname.endsWith(`/${item.path}`));
const cleanups = new Set<() => void>();
let initializer: (() => Promise<void>) | undefined;
let preserveInitialStatus = false;
let initializing = false;
let changingVariant = false;

/** Release the previous view before an in-page variant change, or when leaving the page. */
export function onExampleDispose(cleanup: () => void): void {
    cleanups.add(cleanup);
}
window.addEventListener('pagehide', () => { for (const cleanup of cleanups) cleanup(); cleanups.clear(); }, { once: true });

if (example) {
    const section = sections.find(item => item.id === example.section)!;
    document.title = `Autark — ${example.title}`;
    const introduction = document.querySelector<HTMLElement>('.introduction');
    if (introduction) {
        introduction.querySelector('h1')!.textContent = example.title;
        introduction.querySelector('.description')!.textContent = example.description;
        introduction.querySelector('.eyebrow')!.textContent = section.title;
        const labels = document.createElement('div'); labels.className = 'example-modules';
        for (const id of example.modules) {
            const label = document.createElement('span'); label.className = 'example-module';
            label.style.setProperty('--module-color', modules[id].color); label.textContent = modules[id].label; labels.append(label);
        }
        introduction.append(labels);
    }
    const back = document.querySelector<HTMLAnchorElement>('.back-link');
    if (back) {
        const url = new URL('../../index.html', location.href);
        try { const saved = sessionStorage.getItem('autark-gallery-browse'); if (saved) { const restored = new URL(`index.html${saved}`, url); url.search = restored.search; url.hash = restored.hash; } } catch { /* The unfiltered gallery remains accessible. */ }
        back.href = url.href;
    }
    const main = document.querySelector('main')!;
    const services = externalServices(example);
    if (services.length) {
        const notice = document.createElement('p'); notice.className = 'service-notice';
        notice.textContent = `Internet required · This example accesses ${services.join('; ')}. Some resources may already be cached in your browser.`;
        introduction?.append(notice);
    }
    const learning = document.createElement('section'); learning.className = 'example-learning';
    const title = document.createElement('h2'); title.textContent = 'Code';
    const context = document.createElement('p'); context.textContent = 'The core API calls for this task. The full source below is a minimal runnable program for a page with a canvas.';
    const pre = document.createElement('pre'); pre.className = 'task-code';
    const code = document.createElement('code'); pre.append(code);
    const refresh = () => {
        const state = Object.fromEntries(new URLSearchParams(location.search));
        document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input[id], select[id], select[data-variant-parameter]').forEach(control => {
            const key = control.dataset.variantParameter || control.id;
            state[key] = control instanceof HTMLInputElement && control.type === 'checkbox' ? String(control.checked) : control.value;
        });
        code.innerHTML = highlightTypeScript(exampleCode(example.id, state));
    };
    document.addEventListener('change', refresh);
    document.addEventListener('input', refresh);
    document.addEventListener('example-ready', refresh);
    refresh();
    learning.append(title, context, pre);
    const details = document.createElement('details'); details.className = 'example-source';
    const summary = document.createElement('summary'); summary.textContent = 'View full source';
    const full = document.createElement('pre'); const content = document.createElement('code');
    full.append(content); details.append(summary, full);
    details.addEventListener('toggle', () => {
        if (!details.open || details.dataset.loaded) return;
        const state = Object.fromEntries(new URLSearchParams(location.search));
        content.innerHTML = highlightTypeScript(exampleSource(example.id, state));
        details.dataset.loaded = 'true';
    });
    learning.append(details);
    const related = examples.filter(item => item.section === example.section && item.id !== example.id).slice(0, 3);
    if (related.length) {
        const heading = document.createElement('h2'); heading.textContent = 'Related examples'; learning.append(heading);
        const list = document.createElement('ul');
        for (const item of related) { const li = document.createElement('li'); const link = document.createElement('a'); link.href = new URL(`../../${item.path}`, location.href).href; link.textContent = item.title; li.append(link); list.append(li); }
        learning.append(list);
    }
    main.insertBefore(learning, main.querySelector('.page-footer'));
}

/** A variant control updates the current example, never navigates or reloads the document. */
export function exampleVariant(label: string, choices: Record<string, string>, parameter = 'variant'): string {
    const value = new URL(location.href).searchParams.get(parameter);
    const selected = value && Object.prototype.hasOwnProperty.call(choices, value) ? value : Object.keys(choices)[0]!;
    const existing = [...document.querySelectorAll<HTMLSelectElement>('select[data-variant-parameter]')].find(control => control.dataset.variantParameter === parameter);
    if (existing) { existing.value = selected; return selected; }
    const controls = document.createElement('div'); controls.className = 'controls';
    const field = document.createElement('label'); field.textContent = label;
    const select = document.createElement('select'); select.setAttribute('aria-label', label);
    select.dataset.variantParameter = parameter; select.disabled = initializing;
    for (const [key, text] of Object.entries(choices)) { const option = document.createElement('option'); option.value = key; option.textContent = text; select.append(option); }
    select.value = selected;
    select.addEventListener('change', () => {
        const url = new URL(location.href); url.searchParams.set(parameter, select.value);
        history.replaceState(null, '', url);
        if (!initializer || changingVariant) return;
        changingVariant = true;
        for (const cleanup of cleanups) cleanup();
        cleanups.clear();
        void runExample(initializer, preserveInitialStatus).finally(() => { changingVariant = false; });
    });
    field.append(select); controls.append(field); document.querySelector('.introduction')!.after(controls);
    return selected;
}

/** Keep the map bars synchronized with the example's actual initialization promise. */
export function setExampleState(state: 'loading' | 'ready' | 'error', message?: string): void {
    document.querySelectorAll<HTMLElement>('[data-example-status]').forEach(status => {
        status.dataset.state = state;
        if (message !== undefined) status.textContent = message;
    });
    document.querySelectorAll<HTMLElement>('.map-stage').forEach(stage => stage.setAttribute('aria-busy', String(state === 'loading')));
}

export async function runExample(initialize: () => Promise<void>, preserveStatus = false): Promise<void> {
    if (!initializer) { initializer = initialize; preserveInitialStatus = preserveStatus; }
    initializing = true;
    document.querySelectorAll<HTMLSelectElement>('select[data-variant-parameter]').forEach(control => { control.disabled = true; });
    setExampleState('loading', 'Loading map and data…');
    try {
        await initialize();
        fitExamplePlots();
        setExampleState('ready', preserveStatus ? undefined : 'Interactive map');
    } catch (error) {
        setExampleState('error', `Unable to load this example. ${error instanceof Error ? error.message : String(error)}`);
        console.error('Unable to initialize the gallery example:', error);
    } finally {
        initializing = false;
        document.querySelectorAll<HTMLSelectElement>('select[data-variant-parameter]').forEach(control => { control.disabled = false; });
        document.dispatchEvent(new Event('example-ready'));
    }
}

/** Preserve SVG coordinates for brushing while allowing charts to fit their side panels. */
function fitExamplePlots(): void {
    document.querySelectorAll<HTMLElement>('#plotBody').forEach(body => {
        const fit = () => {
            body.querySelectorAll<SVGSVGElement>(':scope > svg').forEach(svg => {
                const width = Number(svg.getAttribute('width')), height = Number(svg.getAttribute('height'));
                if (width > 0 && height > 0) { svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.style.width = '100%'; svg.style.height = 'auto'; }
            });
        };
        fit();
        const observer = new MutationObserver(fit);
        observer.observe(body, { childList: true, subtree: true });
        onExampleDispose(() => observer.disconnect());
    });
}
