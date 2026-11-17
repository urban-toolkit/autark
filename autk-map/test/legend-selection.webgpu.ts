import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import { AutkMapUi } from '../src/map-ui';
import type { AutkMap } from '../src/map';
import type { Layer } from '../src/layer';
import type { LayerRenderInfo } from '../src/types-layers';

/** Legend buttons select one thematic layer or none, restoring base colors on all others. */
export async function runWebGpuCases() {
    const layers = ['lines', 'stations'].map(id => ({
        layerInfo: { id, typeLayer: 'polylines' },
        supportsColorMap: true,
        layerRenderInfo: {
            isColorMap: true,
            colormap: {
                config: { interpolator: ColorMapInterpolator.CAT_PAIRED, domainSpec: { type: ColorMapDomainStrategy.MIN_MAX } },
                computedLabels: ['A', 'B'],
            },
        },
    } as unknown as Layer));
    const host = document.createElement('div');
    host.style.position = 'relative';
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { display: 'block', width: '640px', height: '400px' });
    host.appendChild(canvas);
    document.body.appendChild(host);
    let ui: AutkMapUi;
    const map = {
        canvas,
        layerManager: { layers, searchByLayerId: (id: string) => layers.find(layer => layer.layerInfo.id === id) },
        updateRenderInfo: (id: string, { renderInfo }: { renderInfo: Partial<LayerRenderInfo> }) => {
            const layer = layers.find(candidate => candidate.layerInfo.id === id)!;
            Object.assign(layer.layerRenderInfo, renderInfo);
            if ('isColorMap' in renderInfo) ui.refreshLegend(layer);
            ui.refreshLayerList();
        },
    } as unknown as AutkMap;
    ui = new AutkMapUi(map);
    const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
    const button = (id: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="Show legend for ${id}"]`)!;
    const selected = () => [...host.querySelectorAll('button[aria-pressed="true"]')];
    try {
        ui.buildUi();
        ui.refreshLegend(layers[0]);
        host.querySelector<HTMLElement>('#autkMapUi')!.click();
        const legend = host.querySelector<HTMLElement>('#autkMapLegend')!;
        assert(selected().length === 1 && button('lines').getAttribute('aria-pressed') === 'true', 'Only the visible legend can have an active button');
        button('stations').click();
        assert(selected().length === 1 && ui.activeLayer === layers[1], 'Selecting a legend must deselect the previous one');
        assert(legend.firstElementChild?.textContent === 'stations', 'Legend content did not switch');
        assert(!layers[0].layerRenderInfo.isColorMap && layers[1].layerRenderInfo.isColorMap, 'Selecting another legend must restore the previous layer\'s base colors');
        button('stations').click();
        assert(selected().length === 0 && legend.style.visibility === 'hidden', 'Clicking the selected legend must allow none');
        assert(layers.every(layer => !layer.layerRenderInfo.isColorMap), 'Deselecting must restore base colors on every layer');
        ui.refreshLegend(layers[0]);
        assert(selected().length === 0 && legend.style.visibility === 'hidden', 'Color or data refresh must not reopen a dismissed legend');
        button('lines').click();
        ui.refreshLegend(layers[1]);
        ui.changeActiveLayer(layers[1]);
        assert(selected().length === 1 && ui.activeLayer === layers[0], 'Picking and another layer refresh must preserve the explicit legend selection');
        assert(layers[0].layerRenderInfo.isColorMap && !layers[1].layerRenderInfo.isColorMap, 'Only the selected layer may retain thematic coloring');
        layers[1].layerRenderInfo.isColorMap = false;
        button('stations').click();
        assert(layers[1].layerRenderInfo.isColorMap && !layers[0].layerRenderInfo.isColorMap && ui.activeLayer === layers[1], 'Selecting a previously uncolored layer must exclusively enable its thematic legend');
        layers.pop();
        ui.handleLayerRemoved('stations');
        ui.refreshLayerList();
        assert(legend.style.visibility === 'hidden' && selected().length === 0, 'Removing the selected layer must leave no selected legend');
        ui.refreshLegend(layers[0]);
        assert(legend.style.visibility === 'hidden', 'Removal must not silently select a different legend');
        return { status: 'passed', checks: ['one legend or none', 'unselected layers return to base colors', 'refresh and picking do not override selection', 'removal clears selection'] };
    } finally {
        ui.destroy();
        host.remove();
    }
}
