const search = document.querySelector<HTMLInputElement>('#example-search')!;
const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-filter]'));
const groups = Array.from(document.querySelectorAll<HTMLElement>('.example-group')).map(element => ({
    element,
    count: element.querySelector<HTMLElement>('.group-count')!,
    cards: Array.from(element.querySelectorAll<HTMLElement>('.example-card')).map(card => ({
        element: card,
        text: normalize(`${card.textContent} ${card.dataset.keywords}`),
    })),
}));
const resultCount = document.querySelector<HTMLElement>('#result-count')!;
const emptyState = document.querySelector<HTMLElement>('.empty-state')!;
const total = groups.reduce((sum, group) => sum + group.cards.length, 0);
let moduleFilter = 'all';

function normalize(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function updateExamples(): void {
    const terms = normalize(search.value).trim().split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const group of groups) {
        let groupVisible = 0;
        for (const card of group.cards) {
            const matches = (moduleFilter === 'all' || group.element.dataset.module === moduleFilter)
                && terms.every(term => card.text.includes(term));
            card.element.hidden = !matches;
            if (matches) groupVisible++;
        }
        group.element.hidden = groupVisible === 0;
        group.count.textContent = String(groupVisible);
        visible += groupVisible;
    }
    for (const button of buttons) {
        button.setAttribute('aria-pressed', String(button.dataset.filter === moduleFilter));
    }
    resultCount.textContent = visible === total
        ? `${total} examples to explore`
        : `${visible} of ${total} examples`;
    emptyState.hidden = visible !== 0;
}

search.addEventListener('input', updateExamples);
for (const button of buttons) {
    button.addEventListener('click', () => {
        moduleFilter = button.dataset.filter!;
        updateExamples();
    });
}
document.querySelector('#reset-filters')!.addEventListener('click', () => {
    search.value = '';
    moduleFilter = 'all';
    updateExamples();
    search.focus();
});
document.querySelector<HTMLElement>('.browse-tools')!.hidden = false;
updateExamples();
