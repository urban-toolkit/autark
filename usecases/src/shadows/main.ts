import { ShadowsApp } from './app';
import { initUi } from './ui';
import { hideLoading, reportError, setLoadingState, showError } from '../shared/ui';

async function main(): Promise<void> {
    try {
        const canvas = document.querySelector('canvas');
        const histogramHost = document.querySelector<HTMLElement>('#histogramBody');
        if (!canvas || !histogramHost) throw new Error('Canvas or histogram host not found.');
        const app = new ShadowsApp();
        await app.init({ canvas, histogramHost, onProgress: setLoadingState, onError: reportError });
        initUi(app);
        hideLoading();
    } catch (error) {
        console.error(error);
        showError('Failed to load the Shadows case study.', 'Check WebGPU support, data paths and the Overpass connection.');
    }
}

void main();
