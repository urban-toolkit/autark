import { AutkMap } from '@urban-toolkit/autk-map';
import { AutkDb } from '@urban-toolkit/autk-db';

const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
const form = document.querySelector<HTMLFormElement>('#generator')!;
const title = document.querySelector<HTMLInputElement>('#title')!;
const subtitle = document.querySelector<HTMLInputElement>('#subtitle')!;
const posterTitle = document.querySelector<HTMLElement>('#poster-title')!;
const posterSubtitle = document.querySelector<HTMLElement>('#poster-subtitle')!;
const bboxInput = document.querySelector<HTMLInputElement>('#bbox')!;
const roadWidth = document.querySelector<HTMLInputElement>('#road-width')!;
const roadValue = document.querySelector<HTMLOutputElement>('#road-value')!;
const download = document.querySelector<HTMLButtonElement>('#download')!;
const status = document.querySelector<HTMLElement>('#status')!;
const db = new AutkDb();
let initialized = false;
let generation = 0;
let map: AutkMap | undefined;
let ready = false;

for (const input of [title, subtitle]) {
    input.addEventListener('input', () => {
        posterTitle.textContent = title.value;
        posterSubtitle.textContent = subtitle.value;
    });
}

roadWidth.addEventListener('input', () => {
    roadValue.value = roadWidth.value;
    map?.updateRenderInfo('table_osm_roads', { renderInfo: { polylinesWidth: Number(roadWidth.value) } });
});

form.addEventListener('submit', async event => {
    event.preventDefault();
    let bbox: [number, number, number, number];
    try {
        const parsed: unknown = JSON.parse(bboxInput.value);
        if (!Array.isArray(parsed) || parsed.length !== 4 || !parsed.every(value => typeof value === 'number' && Number.isFinite(value))) {
            throw new Error('Formato inválido');
        }
        bbox = parsed as [number, number, number, number];
    } catch {
        status.textContent = 'Recorte inválido: use [oeste, sul, leste, norte] com quatro números WGS84.';
        return;
    }
    if (bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90) {
        status.textContent = 'Recorte inválido: use oeste < leste e sul < norte, em graus WGS84.';
        return;
    }
    const controls = form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button');
    controls.forEach(control => { control.disabled = true; });
    download.disabled = true;
    status.textContent = 'Carregando dados do OpenStreetMap via Overpass…';
    try {
        if (!initialized) {
            await db.init();
            initialized = true;
        }
        // Release tables from the previous query; a fresh workspace resets its spatial context.
        for (const table of db.getTablesMetadata()) {
            await db.removeLayer(table.name);
        }
        await db.setWorkspace(`poster_${++generation}`);
        await db.loadOsm({ queryArea: { bbox }, autoLoadLayers: { layers: ['surface', 'water', 'roads'] } });
        const layers = [];
        for (const metadata of db.getLayersMetadata()) {
            const collection = await db.getLayer(metadata.name);
            if (collection.features.length > 0) {
                layers.push({ metadata, collection });
            }
        }
        if (!layers.some(layer => layer.metadata.type === 'roads')) {
            throw new Error('Nenhuma rua encontrada neste recorte. Tente outra área.');
        }
        const bounds = await db.getBoundingBoxFromLayer('table_osm_surface');
        map?.destroy();
        ready = false;
        map = new AutkMap(canvas, false);
        map.style.setPredefinedStyle('poster');
        await map.init();
        for (const { metadata, collection } of layers) {
            map.loadCollection(metadata.name, { collection, type: metadata.type });
        }
        map.updateRenderInfo('table_osm_roads', { renderInfo: { polylinesWidth: Number(roadWidth.value) } });
        const origin = map.layerManager.origin;
        const center = [(bounds.minLon + bounds.maxLon) / 2 - origin[0], (bounds.minLat + bounds.maxLat) / 2 - origin[1], 0];
        const aspect = canvas.clientWidth / canvas.clientHeight;
        const height = Math.max(bounds.maxLat - bounds.minLat, (bounds.maxLon - bounds.minLon) / aspect);
        const distance = height * 1.04 / (2 * Math.tan(map.camera.getFovyRadians() / 2));
        map.camera.resetCamera([0, 1, 0], center, [center[0], center[1], distance]);
        map.draw();
        ready = true;
        status.textContent = 'Mapa pronto. Ajuste o enquadramento, o texto e a largura das ruas; depois baixe o PNG.';
    } catch (error) {
        console.error(error);
        status.textContent = `Não foi possível gerar o mapa: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
        controls.forEach(control => { control.disabled = false; });
        download.disabled = !ready;
    }
});

download.addEventListener('click', async () => {
    if (!map || !ready) return;
    download.disabled = true;
    try {
        const output = document.createElement('canvas');
        output.width = 2400;
        const margin = 60;
        const mapWidth = output.width - 2 * margin;
        const visibleWidth = canvas.offsetWidth;
        const visibleHeight = canvas.offsetHeight;
        const mapHeight = Math.round(mapWidth * visibleHeight / visibleWidth);
        output.height = mapHeight + 2 * margin + 300;

        // Render once at export resolution. Scaling the visible canvas would
        // magnify its CSS-sized framebuffer and lose line detail in the PNG.
        const originalCanvasStyle = canvas.style.cssText;
        try {
            canvas.style.cssText = `${originalCanvasStyle};position:fixed;left:-10000px;top:0;width:${mapWidth}px;height:${mapHeight}px;`;
            map.renderer.resize(mapWidth, mapHeight, 1);
            map.camera.resize(mapWidth, mapHeight);
            map.ui.handleResize();
            map.requestRender();
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            await map.renderer.device.queue.onSubmittedWorkDone();

            const context = output.getContext('2d')!;
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, output.width, output.height);
            context.drawImage(canvas, margin, margin, mapWidth, mapHeight);
            drawPosterCaption(context, output, margin, mapWidth, mapHeight);
        } finally {
            canvas.style.cssText = originalCanvasStyle;
            map.renderer.resize(visibleWidth, visibleHeight, window.devicePixelRatio || 1);
            map.camera.resize(visibleWidth, visibleHeight);
            map.ui.handleResize();
            map.requestRender();
        }
        const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(value => {
            if (value) resolve(value);
            else reject(new Error('Falha ao exportar PNG.'));
        }, 'image/png'));
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${title.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase() || 'mapa'}-autark.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = 'PNG exportado com “made with autark”.';
    } catch (error) {
        status.textContent = `Falha ao exportar: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
        download.disabled = !ready;
    }
});

function drawPosterCaption(
    context: CanvasRenderingContext2D,
    output: HTMLCanvasElement,
    margin: number,
    mapWidth: number,
    mapHeight: number,
): void {
    context.strokeStyle = '#252525';
    context.lineWidth = 2;
    context.strokeRect(margin, margin, mapWidth, mapHeight);
    context.globalAlpha = 0.6;
    context.fillStyle = '#555555';
    context.font = '28px system-ui, sans-serif';
    context.textAlign = 'right';
    context.fillText('made with autark', output.width - margin - 36, margin + mapHeight - 44);
    context.globalAlpha = 1;
    context.fillStyle = '#252525';
    context.textAlign = 'center';
    context.font = '72px system-ui, sans-serif';
    context.letterSpacing = '16px';
    context.fillText(title.value.toLocaleUpperCase('pt-BR'), output.width / 2, margin + mapHeight + 130, mapWidth - 120);
    context.font = '24px system-ui, sans-serif';
    context.letterSpacing = '5px';
    context.fillText(subtitle.value.toLocaleUpperCase('pt-BR'), output.width / 2, margin + mapHeight + 200, mapWidth - 120);
    context.letterSpacing = '0px';
}

window.addEventListener('pagehide', () => map?.destroy());

form.requestSubmit();
