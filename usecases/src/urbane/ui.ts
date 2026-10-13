import type { UrbaneApp } from './app';
import { SCORE_FIELD, SKY_EXPOSURE_FIELD } from './compute';
import { clearError, initDraggablePanel, reportError } from '../shared/ui';

export function initUi(app: UrbaneApp): void {
    const levelButton = document.querySelector<HTMLButtonElement>('#levelBtn')!;
    const thematicSelect = document.querySelector<HTMLSelectElement>('#thematicSelect')!;
    const slidersContainer = document.querySelector<HTMLElement>('#weightsSliders')!;
    const panel = document.querySelector<HTMLElement>('#weightsPanel')!;

    [{ value: 'none', label: 'None' }, { value: SCORE_FIELD, label: 'Score' },
        ...app.datasets.map((dataset) => ({ value: `sjoin.count.${dataset}`, label: dataset.replace(/_/g, ' ') })),
        { value: SKY_EXPOSURE_FIELD, label: 'Sky Exposure' },
    ].forEach(({ value, label }) => thematicSelect.add(new Option(label, value)));
    thematicSelect.addEventListener('change', () => app.updateThematic(thematicSelect.value));

    const labels = [...app.datasets.map((dataset) => dataset.replace(/_/g, ' ')), 'Sky Exposure'];
    [...app.weights, app.skyExposureWeight].forEach((weight, index) => {
        const column = document.createElement('div');
        column.className = 'weight-col';
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
        slider.setAttribute('aria-label', labels[index]);
        slider.addEventListener('input', () => {
            const others = [...slidersContainer.querySelectorAll<HTMLInputElement>('input')].filter((item) => item !== slider);
            const remaining = Math.max(0, 1 - others.reduce((sum, item) => sum + Number(item.value), 0));
            slider.value = String(Math.min(Number(slider.value), Number(remaining.toFixed(2))));
            valueLabel.textContent = Number(slider.value).toFixed(2);
        });
        const nameLabel = document.createElement('span');
        nameLabel.className = 'weight-label';
        nameLabel.textContent = labels[index];
        column.append(valueLabel, slider, nameLabel);
        slidersContainer.appendChild(column);
    });

    const computeButton = document.createElement('button');
    computeButton.id = 'weightsCompute';
    computeButton.textContent = 'Compute Score';
    panel.appendChild(computeButton);

    // All asynchronous actions share one UI lock and always restore controls.
    async function runOperation(action: () => Promise<void>): Promise<void> {
        const controls = [levelButton, thematicSelect, computeButton,
            ...slidersContainer.querySelectorAll<HTMLInputElement>('input')];
        controls.forEach((control) => { control.disabled = true; });
        clearError();
        try { await action(); }
        catch (error) { reportError(error); }
        finally {
            controls.forEach((control) => { control.disabled = false; });
            updateLevelButton(app, levelButton);
        }
    }

    levelButton.addEventListener('click', () => {
        void runOperation(() => app.currentLevel === 'neighborhoods'
            ? app.drillDown(thematicSelect.value) : app.drillUp(thematicSelect.value));
    });
    computeButton.addEventListener('click', () => {
        const weights = [...slidersContainer.querySelectorAll<HTMLInputElement>('input')].map((slider) => Number(slider.value));
        void runOperation(() => app.updateWeights(weights, thematicSelect.value));
    });
    updateLevelButton(app, levelButton);
    const plot = document.querySelector<HTMLElement>('#plot')!;
    plot.classList.add('hidden-plot');
    document.querySelector('#plotToggle')!.addEventListener('click', () => plot.classList.toggle('hidden-plot'));
    initDraggablePanel(plot, document.querySelector<HTMLElement>('#plotBar')!);
}

function updateLevelButton(app: UrbaneApp, button: HTMLButtonElement): void {
    const buildings = app.currentLevel === 'active_buildings';
    document.querySelector<HTMLElement>('#levelBtnDown')!.style.display = buildings ? 'none' : '';
    document.querySelector<HTMLElement>('#levelBtnUp')!.style.display = buildings ? '' : 'none';
    button.title = buildings ? 'Back to neighborhoods' : 'Drill into buildings';
}
