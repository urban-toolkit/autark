import { AutkMap } from '@urban-toolkit/autk-map';
import { CameraMotion } from '@urban-toolkit/autk-core';
import { runExample } from '../example';

async function main(): Promise<void> {
    const response = await fetch(`${(import.meta as any).env.BASE_URL}data/mnt_neighs_proj.geojson`);
    if (!response.ok) throw new Error(`Could not load neighborhoods: HTTP ${response.status}`);
    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    await map.init();
    map.loadCollection('neighborhoods', { collection: await response.json() });
    map.fitBounds();
    map.draw();
    const controls = document.createElement('div'); controls.className = 'controls';
    for (const label of ['Geographic view', 'Fit data', 'Animate']) {
        const button = document.createElement('button'); button.textContent = label; controls.append(button);
        button.addEventListener('click', async () => {
            if (label === 'Geographic view') map.setView({ center: { latitude: 40.7831, longitude: -73.9712 }, zoom: 12 });
            else if (label === 'Fit data') map.fitBounds();
            else {
                button.disabled = true;
                try { await new CameraMotion().zoomOut(1.5, 1).pitch(-35, 1).yaw(20, 1).zoomIn(1.5, 1).play(map.camera); }
                finally { button.disabled = false; }
            }
        });
    }
    document.querySelector('.introduction')!.after(controls);
    window.addEventListener('pagehide', () => map.destroy(), { once: true });
}
void runExample(main);
