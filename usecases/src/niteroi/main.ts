import { NiteroiApp } from './app';
import { initUi } from './ui';
import { hideLoading, setLoadingState, showError } from '../shared/ui';

async function main(): Promise<void> {
    try {
        const canvas = document.querySelector('canvas');
        const scatterHost = document.querySelector<HTMLElement>('#plotBody');
        const lineHost = document.querySelector<HTMLElement>('#linePlotBody');
        if (!canvas || !scatterHost || !lineHost) throw new Error('Canvas or plot host not found.');
        const app = new NiteroiApp();
        await app.init({ canvas, scatterHost, lineHost, onProgress: setLoadingState });
        initUi(app);
        hideLoading();
    } catch (error) {
        console.error(error);
        showError('Failed to load the Niterói case study.', 'Check WebGPU support, data paths and the Overpass connection.');
    }
}

void main();
