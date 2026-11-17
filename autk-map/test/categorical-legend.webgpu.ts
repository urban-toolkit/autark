import { ColorMap, ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';
import { AutkMapUi } from '../src/map-ui';
import type { AutkMap } from '../src/map';
import type { Layer } from '../src/layer';

/** Real browser layout: long categorical names must wrap rather than collide. No GPU is needed. */
export async function runWebGpuCases() {
    class TestUi extends AutkMapUi {
        showLegend() { this.buildLegend(); }
    }
    const labels = ['Bakerloo', 'Central', 'Circle', 'District', 'Hammersmith & City', 'Jubilee',
        'Metropolitan', 'Northern', 'Piccadilly', 'Victoria', 'Waterloo & City'];
    const layer = {
        layerInfo: { id: 'tube_lines' },
        layerRenderInfo: {
            isColorMap: true,
            colormap: {
                config: { interpolator: ColorMapInterpolator.CAT_PAIRED, domainSpec: { type: ColorMapDomainStrategy.USER, params: labels } },
                computedLabels: labels,
            },
        },
    } as unknown as Layer;
    const host = document.createElement('div');
    host.style.position = 'relative';
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { display: 'block', width: '960px', height: '400px' });
    host.appendChild(canvas);
    document.body.appendChild(host);
    const ui = new TestUi({ canvas, layerManager: { searchByLayerId: () => layer } } as unknown as AutkMap);
    const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
    const settle = async () => {
        for (let i = 0; i < 3; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    };
    const checks: string[] = [];
    try {
        ui.buildBranding();
        ui.showLegend();
        ui.refreshLegend(layer);
        const legend = host.querySelector<HTMLElement>('#autkMapLegend')!;
        for (const [width, height] of [[960, 400], [320, 220], [200, 220]]) {
            canvas.style.width = `${width}px`;
            canvas.style.height = `${height}px`;
            ui.handleResize();
            await settle();
            const list = legend.querySelector<HTMLElement>('.autk-map-legend-categories');
            assert(!!list, 'Categorical legend needs a swatch list, not a cramped horizontal ramp');
            const rows = [...list!.children] as HTMLElement[];
            assert(rows.length === labels.length, 'Every category needs its own row');
            const colors = ColorMap.getColorArray(ColorMapInterpolator.CAT_PAIRED, 12);
            rows.forEach((row, index) => {
                const [swatch, text] = [...row.children] as HTMLElement[];
                const c = colors[index];
                assert(text.textContent === labels[index], 'Label order changed');
                assert(swatch.style.backgroundColor === `rgb(${c.r}, ${c.g}, ${c.b})`, 'Swatch color does not match the palette');
                assert(swatch.getBoundingClientRect().right <= text.getBoundingClientRect().left, 'Swatch overlaps its label');
                if (index > 0) assert(rows[index - 1].getBoundingClientRect().bottom <= row.getBoundingClientRect().top, 'Category rows overlap');
            });
            const bounds = legend.getBoundingClientRect(), map = canvas.getBoundingClientRect();
            assert(bounds.left >= map.left && bounds.right <= map.right && bounds.top >= map.top && bounds.bottom <= map.bottom, 'Legend must stay inside the canvas');
            assert(legend.scrollWidth <= legend.clientWidth, 'Long names must wrap instead of overflowing');
            if (height === 220) {
                assert(legend.scrollHeight > legend.clientHeight, 'Tall categorical legends must scroll');
                legend.scrollTop = legend.scrollHeight;
                assert(legend.scrollTop > 0, 'Last category must remain reachable');
                legend.scrollTop = 0;
            }
            checks.push(`${width}x${height}: 11 readable names, matching swatches, bounded and scrollable`);
        }
        layer.layerRenderInfo.colormap.config = {
            interpolator: ColorMapInterpolator.SEQ_VIRIDIS,
            domainSpec: { type: ColorMapDomainStrategy.MIN_MAX },
        };
        layer.layerRenderInfo.colormap.computedLabels = ['0', '100'];
        ui.refreshLegend(layer);
        await settle();
        assert(!legend.querySelector('.autk-map-legend-categories') && !!legend.querySelector('svg'), 'Continuous legends must keep their color ramp');
        assert(legend.style.height === '80px', 'Continuous height must reset after a categorical legend');
        checks.push('categorical-to-continuous transition retains the existing ramp');
        return { status: 'passed', checks };
    } finally {
        ui.destroy();
        host.remove();
    }
}
