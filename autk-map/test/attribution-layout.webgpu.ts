import { AutkMapUi } from '../src/map-ui';
import type { AutkMap } from '../src/map';
import { TILE_SOURCES } from '../src/tile-source';
import { TERRAIN_TILE_SOURCES } from '../src/terrain-tile-source';

/** Real DOM layout, including late font changes and provider replacement. */
export async function runWebGpuCases() {
    class TestUi extends AutkMapUi {
        showLegend() {
            this.buildLegend();
            this._legend!.style.visibility = 'visible';
            return this._legend!;
        }
    }
    const host = document.createElement('div');
    Object.assign(host.style, { position: 'relative', padding: '24px', width: 'max-content' });
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { display: 'block', height: '400px' });
    host.appendChild(canvas);
    document.body.appendChild(host);
    const ui = new TestUi({ canvas } as AutkMap);
    const settle = async () => {
        // Allow ResizeObserver delivery followed by the resulting layout.
        for (let i = 0; i < 3; i++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    };
    const assert = (value: boolean, message: string) => { if (!value) throw new Error(message); };
    const checks: string[] = [];
    try {
        ui.buildBranding();
        const legend = ui.showLegend();
        for (const width of [960, 640, 480, 320]) {
            canvas.style.width = `${width}px`;
            for (const providers of [[], [TILE_SOURCES.esriWorldImagery.attribution, ...TERRAIN_TILE_SOURCES.awsTerrarium.attribution, TILE_SOURCES.openStreetMap.attribution]]) {
                ui.setAttribution(providers);
                await settle();
                for (const fontFamily of ['system-ui', 'monospace']) {
                    const credits = host.querySelector<HTMLElement>('.autk-map-attribution')!;
                    credits.style.fontFamily = fontFamily;
                    await settle();
                    const c = credits.getBoundingClientRect(), l = legend.getBoundingClientRect(), map = canvas.getBoundingClientRect();
                    assert(c.right <= map.right - 9, 'Credits must stay inside the canvas');
                    assert(Math.abs(c.left - map.left - 10) < 1 && Math.abs(map.bottom - c.bottom - 10) < 1, 'Watermark must keep its bottom margin');
                    assert(c.right <= l.left || c.left >= l.right || c.bottom <= l.top || c.top >= l.bottom, 'Legend and credits must not overlap');
                    assert(l.top >= map.top && l.right <= map.right, 'Legend must remain inside the map');
                    assert(Math.abs(map.bottom - l.bottom - 12) < 1, 'Legend must keep its fixed bottom inset regardless of credit width');
                    assert(credits.scrollHeight <= credits.clientHeight, 'Provider text must remain visible');
                    assert(c.height === 12, 'Credits must stay on one compact line');
                    const autark = credits.querySelector<HTMLAnchorElement>('a[href="https://www.autarkjs.org"]')!;
                    assert(getComputedStyle(autark).color === 'rgb(52, 81, 178)', 'Autark link must use the gallery blue');
                    if (credits.scrollWidth > credits.clientWidth) {
                        credits.scrollLeft = credits.scrollWidth;
                        assert(credits.scrollLeft > 0, 'Long credit lines must remain horizontally scrollable');
                    }
                    if (providers.length) {
                        for (const provider of ['Esri', 'Vantor', 'Earthstar Geographics', 'GIS User Community', 'Mapzen', 'OpenStreetMap']) {
                            assert(credits.textContent!.includes(provider), `Missing provider ${provider}`);
                        }
                    }
                }
                checks.push(`${width}px: ${providers.length ? 'imagery, terrain, and OSM' : 'branding only'}; no overlap after font changes`);
            }
        }
        ui.destroy();
        assert(!host.querySelector('.autk-map-branding') && !host.querySelector('#autkMapLegend'), 'Destroy must remove overlays');
        return { status: 'passed', checks };
    } finally {
        ui.destroy();
        host.remove();
    }
}
