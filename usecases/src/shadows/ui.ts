import type { ShadowsApp } from './app';
import { MONTH_CONFIG } from './utils';
import { clearError, initDraggablePanel, reportError } from '../shared/ui';

export function initUi(app: ShadowsApp): void {
    const select = document.querySelector<HTMLSelectElement>('#monthSelect')!;
    for (const month of MONTH_CONFIG) select.add(new Option(month.label, month.code));
    select.addEventListener('change', async () => {
        select.disabled = true;
        clearError();
        try { await app.changeMonth(select.value); }
        catch (error) { reportError(error); }
        finally { select.disabled = false; }
    });
    document.querySelectorAll<HTMLInputElement>('input[name="mode"]').forEach((input) => {
        input.addEventListener('change', () => {
            const mode = input.value;
            if (mode === 'heatmap' || mode === 'compute' || mode === 'contribution') app.changeDisplayMode(mode);
        });
    });
    initDraggablePanel(document.querySelector<HTMLElement>('#histogramPanel')!, document.querySelector<HTMLElement>('#histogramBar')!);
}
