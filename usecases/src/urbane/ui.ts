import { Urbane } from './main';

// ── Loading overlay ───────────────────────────────────────────────────────────

function setLoadingState(message: string, note?: string): void {
    const text = document.getElementById('loading-text');
    const noteEl = document.getElementById('loading-note');
    if (text) text.textContent = message;
    if (noteEl) noteEl.textContent = note ?? '';
}

function hideLoading(): void {
    document.getElementById('loading-overlay')?.classList.add('hidden');
}

function showError(message: string, note?: string): void {
    const overlay = document.getElementById('loading-overlay');
    const title = document.getElementById('loading-title');
    const text = document.getElementById('loading-text');
    const noteEl = document.getElementById('loading-note');
    overlay?.classList.remove('hidden');
    overlay?.classList.add('error');
    if (title) title.textContent = 'Loading Error';
    if (text) text.textContent = message;
    if (noteEl) noteEl.textContent = note ?? 'Please reload the page and try again.';
}

// Make loading helpers available as globals so the Urbane class can call them
// via the `declare` statements in main.ts.
(window as any).setLoadingState = setLoadingState;
(window as any).hideLoading = hideLoading;
(window as any).showError = showError;

// ── Drill-down button ─────────────────────────────────────────────────────────

function initDrillDownButton(urbane: Urbane): void {
    const btn = document.querySelector('#levelBtn') as HTMLButtonElement;
    const iconDown = document.querySelector('#levelBtnDown') as HTMLElement;
    const iconUp = document.querySelector('#levelBtnUp') as HTMLElement;
    const thematicSelect = document.querySelector('#thematicSelect') as HTMLSelectElement;

    btn.addEventListener('click', async () => {
        btn.disabled = true;
        await urbane.drillDown(thematicSelect.value);

        if (urbane.currentLevel === 'active_buildings') {
            iconDown.style.display = 'none';
            iconUp.style.display = '';
            btn.title = 'Back to neighborhoods';
        } else {
            iconDown.style.display = '';
            iconUp.style.display = 'none';
            btn.title = 'Drill into buildings';
        }

        btn.disabled = false;
    });
}

// ── Thematic select ───────────────────────────────────────────────────────────

function initThematicSelect(urbane: Urbane): void {
    const select = document.querySelector('#thematicSelect') as HTMLSelectElement;

    [{ value: 'none', text: 'None' }, { value: 'compute.score', text: 'Score' }].forEach(({ value, text }) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        select.appendChild(opt);
    });

    urbane.datasets.forEach(dataset => {
        const opt = document.createElement('option');
        opt.value = `sjoin.count.${dataset}`;
        opt.textContent = dataset.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        select.appendChild(opt);
    });

    const svfOpt = document.createElement('option');
    svfOpt.value = 'sjoin.avg.skyExposure';
    svfOpt.textContent = 'Sky Exposure';
    select.appendChild(svfOpt);

    select.addEventListener('change', () => urbane.updateThematicData(select.value));
}

// ── Weight sliders ────────────────────────────────────────────────────────────

function initWeightSliders(urbane: Urbane): void {
    const slidersContainer = document.querySelector('#weightsSliders') as HTMLElement;
    const panel = document.querySelector('#weightsPanel') as HTMLElement;

    const allWeights = [...urbane.weights, urbane.skyExposureWeight];
    const allLabels = [
        ...urbane.datasets.map(d => d.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())),
        'Sky Exposure',
    ];

    allWeights.forEach((weight, i) => {
        const col = document.createElement('div');
        col.className = 'weight-col';

        const valueLabel = document.createElement('span');
        valueLabel.className = 'weight-value';
        valueLabel.textContent = weight.toFixed(2);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '1';
        slider.step = '0.01';
        slider.value = String(weight);
        slider.className = 'weight-slider';
        slider.addEventListener('input', () => {
            const allSliders = [...document.querySelectorAll<HTMLInputElement>('.weight-slider')];
            const othersSum = allSliders.filter(s => s !== slider).reduce((sum, s) => sum + +s.value, 0);
            const maxVal = +Math.max(0, 1 - othersSum).toFixed(2);
            if (+slider.value > maxVal) slider.value = String(maxVal);
            valueLabel.textContent = (+slider.value).toFixed(2);
        });

        const nameLabel = document.createElement('span');
        nameLabel.className = 'weight-label';
        nameLabel.textContent = allLabels[i];

        col.append(valueLabel, slider, nameLabel);
        slidersContainer.appendChild(col);
    });

    const computeBtn = document.createElement('button');
    computeBtn.id = 'weightsCompute';
    computeBtn.textContent = 'Compute Score';
    computeBtn.addEventListener('click', () => {
        const weights = [...document.querySelectorAll<HTMLInputElement>('.weight-slider')].map(s => +s.value);
        const select = document.querySelector('#thematicSelect') as HTMLSelectElement;
        urbane.updateWeights(weights, select.value);
    });
    panel.appendChild(computeBtn);
}

// ── Floating plot panel ───────────────────────────────────────────────────────

function initPlotPanel(): void {
    const plot = document.querySelector('#plot') as HTMLElement;
    const bar = document.querySelector('#plotBar') as HTMLElement;
    const toggle = document.querySelector('#plotToggle') as HTMLElement;
    let startX = 0, startY = 0;

    plot.classList.add('hidden-plot');
    toggle.addEventListener('click', () => plot.classList.toggle('hidden-plot'));

    bar.addEventListener('pointerdown', e => {
        startX = e.clientX;
        startY = e.clientY;
        bar.setPointerCapture(e.pointerId);
    });

    bar.addEventListener('pointermove', e => {
        if (!bar.hasPointerCapture(e.pointerId)) return;
        plot.style.left = plot.offsetLeft + (e.clientX - startX) + 'px';
        plot.style.top = plot.offsetTop + (e.clientY - startY) + 'px';
        startX = e.clientX;
        startY = e.clientY;
    });

    bar.addEventListener('pointerup', e => bar.releasePointerCapture(e.pointerId));
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

function initUi(urbane: Urbane): void {
    initDrillDownButton(urbane);
    initThematicSelect(urbane);
    initWeightSliders(urbane);
    initPlotPanel();
}

async function main(): Promise<void> {
    try {
        const canvas = document.querySelector('canvas');
        const plotDivParallel = document.querySelector('#plotBodyParallel') as HTMLElement;
        const plotDivTable = document.querySelector('#plotBodyTable') as HTMLElement;

        if (!(canvas instanceof HTMLCanvasElement) || !plotDivParallel || !plotDivTable) {
            throw new Error('Canvas or plot body element not found.');
        }

        const urbane = new Urbane();
        await urbane.run(canvas, plotDivParallel, plotDivTable);

        (window as any).urbane = urbane;
        hideLoading();
        initUi(urbane);
    } catch (error) {
        console.error(error);
        showError('Failed to load the Urbane case study.', 'Please verify the dataset paths and reload the page.');
    }
}

main();
