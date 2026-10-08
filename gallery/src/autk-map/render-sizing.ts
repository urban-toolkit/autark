import type { FeatureCollection } from 'geojson';
import { AutkMap, MapEvent, DEFAULT_POINT_SIZE, DEFAULT_LINE_WIDTH } from '@urban-toolkit/autk-map';

async function main(): Promise<void> {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
    const map = new AutkMap(canvas);
    await map.init();
    document.querySelector<HTMLInputElement>('#point-size')!.value = String(DEFAULT_POINT_SIZE);
    document.querySelector('#point-value')!.textContent = String(DEFAULT_POINT_SIZE);
    document.querySelector<HTMLInputElement>('#line-width')!.value = String(DEFAULT_LINE_WIDTH);
    document.querySelector('#line-value')!.textContent = String(DEFAULT_LINE_WIDTH);

    const lines: FeatureCollection = { type: 'FeatureCollection', features: [
        { type: 'Feature', id: 'bends', geometry: { type: 'LineString', coordinates: [[0, 0], [150, 0], [150, 100], [250, 100]] }, properties: {} },
        { type: 'Feature', id: 'closed', geometry: { type: 'LineString', coordinates: [[0, 150], [100, 150], [100, 250], [0, 250], [0, 150]] }, properties: {} },
        { type: 'Feature', id: 'acute', geometry: { type: 'LineString', coordinates: [[150, 250], [300, 250], [160, 260]] }, properties: {} },
    ] };
    const roads: FeatureCollection = { type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, -70], [300, -70]] }, properties: { highway: 'motorway' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, -110], [300, -110]] }, properties: { highway: 'residential' } },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, -150], [300, -150]] }, properties: { highway: 'path' } },
    ] };
    const points: FeatureCollection = { type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[0, 0], [250, 100], [0, 250]] }, properties: {} },
    ] };
    map.loadCollection('lines', { collection: lines, type: 'polylines' });
    map.loadCollection('roads', { collection: roads, type: 'roads' });
    map.loadCollection('points', { collection: points, type: 'points' });
    map.updateRenderInfo('points', { renderInfo: { isPick: true } });
    map.camera.resetCamera([0, 1, 0], [0, -50, 0], [0, -50, 700]);

    document.querySelector<HTMLInputElement>('#point-size')!.addEventListener('input', event => {
        const pointSize = Number((event.target as HTMLInputElement).value);
        map.updateRenderInfo('points', { renderInfo: { pointSize } });
        document.querySelector('#point-value')!.textContent = String(pointSize);
    });
    document.querySelector<HTMLInputElement>('#line-width')!.addEventListener('input', event => {
        const polylinesWidth = Number((event.target as HTMLInputElement).value);
        map.updateRenderInfo('lines', { renderInfo: { polylinesWidth } });
        document.querySelector('#line-value')!.textContent = String(polylinesWidth);
    });
    document.querySelector<HTMLInputElement>('#road-width')!.addEventListener('input', event => {
        const polylinesWidth = Number((event.target as HTMLInputElement).value);
        map.updateRenderInfo('roads', { renderInfo: { polylinesWidth } });
        document.querySelector('#road-value')!.textContent = String(polylinesWidth);
    });
    document.querySelector<HTMLSelectElement>('#picking-layer')!.addEventListener('change', event => {
        map.updateRenderInfo((event.target as HTMLSelectElement).value, { renderInfo: { isPick: true } });
    });
    map.events.on(MapEvent.PICKING, ({ layerId, selection }) => {
        document.querySelector('#selection')!.textContent = `${layerId}: ${selection.join(', ') || 'no hit'}`;
    });
    map.draw();
}

main().catch(console.error);
