import { examples, modules, sections, externalServices, type ModuleId } from './catalog';

const search = document.querySelector<HTMLInputElement>('#example-search')!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-filter]')];
const container = document.querySelector<HTMLElement>('#examples')!;
const navigation = document.querySelector<HTMLElement>('.section-links')!;
const resultCount = document.querySelector<HTMLElement>('#result-count')!;
const emptyState = document.querySelector<HTMLElement>('.empty-state')!;
const parameters = new URLSearchParams(location.search);
let moduleFilter = parameters.get('module') ?? 'all';
if (moduleFilter !== 'all' && !(moduleFilter in modules)) moduleFilter = 'all';
search.value = parameters.get('q') ?? '';

for (const section of sections) {
    const group = document.createElement('section');
    group.id = section.id;
    group.className = 'example-group';
    group.setAttribute('aria-labelledby', `${section.id}-title`);
    group.innerHTML = `<div class="section-header"><div><h2 id="${section.id}-title">${section.title} <span class="group-count"></span></h2><p class="section-description">${section.description}</p></div></div><ul class="example-grid"></ul>`;
    for (const example of examples.filter(item => item.section === section.id)) {
        const card = document.createElement('li');
        card.className = 'example-card';
        card.dataset.id = example.id;
        const link = document.createElement('a');
        link.href = example.path;
        const preview = document.createElement('img');
        preview.src = `previews/${example.id.toLowerCase()}.png`;
        preview.alt = '';
        preview.loading = 'lazy';
        preview.className = 'card-preview';
        preview.hidden = true;
        preview.addEventListener('load', () => { preview.hidden = false; });
        const title = document.createElement('h3'); title.textContent = example.title;
        const description = document.createElement('p'); description.textContent = example.description;
        const labels = document.createElement('div'); labels.className = 'module-labels';
        for (const id of example.modules) {
            const label = document.createElement('span');
            label.className = 'module-label';
            label.style.setProperty('--module-color', modules[id].color);
            label.textContent = modules[id].label;
            labels.append(label);
        }
        const services = externalServices(example);
        if (services.length) {
            const notice = document.createElement('span'); notice.className = 'service-label';
            notice.textContent = 'Uses external services'; notice.title = services.join('; '); labels.append(notice);
        }
        link.append(preview, title, description, labels);
        card.append(link);
        group.querySelector('ul')!.append(card);
    }
    container.append(group);
    const jump = document.createElement('a'); jump.href = `#${section.id}`; jump.textContent = section.title; jump.dataset.section = section.id; navigation.append(jump);
}

function updateExamples(): void {
    const terms = search.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const example of examples) {
        const text = `${example.title} ${example.description} ${example.tryIt} ${example.modules.join(' ')} ${sections.find(section => section.id === example.section)!.title}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const matches = (moduleFilter === 'all' || example.modules.includes(moduleFilter as ModuleId)) && terms.every(term => text.includes(term));
        container.querySelector<HTMLElement>(`[data-id="${example.id}"]`)!.hidden = !matches;
        if (matches) visible++;
    }
    for (const section of sections) {
        const group = document.getElementById(section.id)!;
        const count = group.querySelectorAll('.example-card:not([hidden])').length;
        group.hidden = count === 0;
        group.querySelector('.group-count')!.textContent = String(count);
        navigation.querySelector<HTMLElement>(`[data-section="${section.id}"]`)!.hidden = count === 0;
    }
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.filter === moduleFilter));
    resultCount.textContent = visible === examples.length ? `${examples.length} examples to explore` : `${visible} of ${examples.length} examples`;
    emptyState.hidden = visible > 0;
    const url = new URL(location.href);
    if (moduleFilter === 'all') url.searchParams.delete('module'); else url.searchParams.set('module', moduleFilter);
    if (search.value.trim()) url.searchParams.set('q', search.value.trim()); else url.searchParams.delete('q');
    history.replaceState(null, '', url);
    try { sessionStorage.setItem('autark-gallery-browse', `${url.search}${url.hash}`); } catch { /* Browsing still works without storage. */ }
}

search.addEventListener('input', updateExamples);
for (const button of buttons) button.addEventListener('click', () => { moduleFilter = button.dataset.filter!; updateExamples(); });
document.querySelector('#reset-filters')!.addEventListener('click', () => { search.value = ''; moduleFilter = 'all'; updateExamples(); search.focus(); });
window.addEventListener('hashchange', updateExamples);
updateExamples();
