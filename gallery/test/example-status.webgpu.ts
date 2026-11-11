import { runExample } from '../src/example';

/** Exercise deferred initialization and failure states against the real two-map page. */
export async function runWebGpuCases() {
    const html = await fetch('/gallery/src/autk-map/osm-layers-api-multi.html').then(response => response.text());
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    document.body.innerHTML = parsed.body.innerHTML;
    const statuses = Array.from(document.querySelectorAll<HTMLElement>('[data-example-status]'));
    const stages = Array.from(document.querySelectorAll<HTMLElement>('.map-stage'));
    const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
    assert(statuses.length === 2 && stages.length === 2, 'Both maps need independent bars');
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    const running = runExample(() => pending);
    assert(statuses.every(status => status.dataset.state === 'loading'), 'Loading must persist while initialization is pending');
    assert(stages.every(stage => stage.getAttribute('aria-busy') === 'true'), 'Both maps must remain busy');
    finish();
    await running;
    assert(statuses.every(status => status.dataset.state === 'ready' && status.textContent === 'Interactive map'), 'Successful initialization marks both maps ready');
    assert(stages.every(stage => stage.getAttribute('aria-busy') === 'false'), 'Ready maps must not remain busy');
    const log = console.error;
    let reported = false;
    console.error = () => { reported = true; };
    try {
        await runExample(async () => { throw new Error('Simulated data loading failure'); });
    } finally { console.error = log; }
    assert(reported && statuses.every(status => status.dataset.state === 'error'), 'Loading failures must be reported in both bars');
    assert(stages.every(stage => stage.getAttribute('aria-busy') === 'false'), 'Failed initialization must clear busy state');
    await runExample(async () => { statuses.forEach(status => { status.textContent = 'RGB mode details'; }); }, true);
    assert(statuses.every(status => status.dataset.state === 'ready' && status.textContent === 'RGB mode details'), 'Custom mode details must survive successful initialization');
    return { status: 'passed', checks: ['pending initialization stays loading', 'two-map readiness and busy state',
        'rejected initialization shows errors', 'custom status text is preserved'] };
}
