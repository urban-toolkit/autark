import type { NiteroiApp } from './app';
import { BAND_COUNT, START_YEAR } from './config';
import { clearError, initDraggablePanel, reportError } from '../shared/ui';

export function initUi(app: NiteroiApp): void {
    const yearSelect = document.querySelector<HTMLSelectElement>('#yearSelect')!;
    const angleToggle = document.querySelector<HTMLInputElement>('#angleToggle')!;
    for (let i = 0; i < BAND_COUNT; i++) {
        const year = String(START_YEAR + i);
        yearSelect.add(new Option(year, year));
    }
    yearSelect.addEventListener('change', () => {
        try {
            clearError();
            app.changeYear(Number(yearSelect.value));
        } catch (error) { reportError(error); }
    });
    angleToggle.addEventListener('change', () => app.changeMode(angleToggle.checked ? 'angle' : 'year'));
    const panel = document.querySelector<HTMLElement>('#plotPanel')!;
    panel.classList.add('hidden-plot');
    document.querySelector('#plotToggle')!.addEventListener('click', () => panel.classList.toggle('hidden-plot'));
    initDraggablePanel(panel, document.querySelector<HTMLElement>('#plotBar')!);
}
