import { AutkMap } from '@urban-toolkit/autk-map';
import type { LayerType } from '@urban-toolkit/autk-core';
import { exampleVariant, onExampleDispose, runExample } from '../example';

const BASE_URL = (import.meta as any).env.BASE_URL;

/** Each variant loads its own prepared dataset under its own layer id. */
const datasets: Record<string, { file: string; layer: string; label: string; type?: LayerType; tune: 'none' | 'width' | 'size' }> = {
    polygons: { file: 'mnt_neighs_proj.geojson', layer: 'neighborhoods', label: 'Neighborhood polygons', tune: 'none' },
    lines: { file: 'mnt_neigh_boundaries.geojson', layer: 'neighborhood-boundaries', label: 'Neighborhood boundaries', type: 'polylines', tune: 'width' },
    points: { file: 'mnt_neigh_centers.geojson', layer: 'neighborhood-centers', label: 'Neighborhood centers', type: 'points', tune: 'size' },
};

async function main(): Promise<void> {
    const geometry = exampleVariant('Geometry', { polygons: 'Neighborhood polygons', lines: 'Neighborhood boundaries', points: 'Neighborhood centers' });
    const { file, layer, label, type, tune } = datasets[geometry]!;
    document.querySelector('#map-title')!.textContent = label;

    const map = new AutkMap(document.querySelector<HTMLCanvasElement>('canvas')!);
    onExampleDispose(() => map.destroy());
    await map.init();
    const response = await fetch(`${BASE_URL}data/${file}`);
    if (!response.ok) throw new Error(`Could not load ${file}: HTTP ${response.status}`);

    map.loadCollection(layer, { collection: await response.json(), ...(type ? { type } : {}) });
    // Widths and sizes are map units, so they stay visible at the full-city view.
    if (tune === 'width') map.updateRenderInfo(layer, { polylinesWidth: 120 });
    if (tune === 'size') map.updateRenderInfo(layer, { pointSize: 160 });
    map.fitBounds();
    map.draw();
}
void runExample(main);
