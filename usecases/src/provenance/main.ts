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
        // Local inspection from the browser console.
        (window as unknown as Record<string, unknown>).autk = app.inspection;
    } catch (error) {
        console.error(error);
        showError('Failed to load the Provenance case study.', 'Check the data paths and reload the page.');
    }
}

void main();
