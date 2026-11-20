import { ProvenanceApp } from './app';
import { buildWorkspace, initUi } from './ui';
import { hideLoading, reportError, setLoadingState, showError } from '../shared/ui';

async function main(): Promise<void> {
    try {
        buildWorkspace();
        const app = new ProvenanceApp();
        await app.init({
            canvas: document.querySelector<HTMLCanvasElement>('#map')!,
            labs: [
                { box: document.querySelector<HTMLElement>('#lab-plot-box')!, message: document.querySelector<HTMLElement>('#lab-message')! },
                { box: document.querySelector<HTMLElement>('#plab-plot-box')!, message: document.querySelector<HTMLElement>('#plab-message')! },
            ],
            onProgress: setLoadingState,
            onError: reportError,
        });
        initUi(app);
        hideLoading();
        // Inspection from the browser console, while developing only (scripts in figures/ and bench/ read it).
        if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).autk = app.inspection;
    } catch (error) {
        console.error(error);
        showError('Failed to load the provenance use case.', 'Check the data paths and reload the page.');
    }
}

void main();
