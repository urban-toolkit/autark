import type { FeatureCollection } from 'geojson';
import { AutkSpatialDb } from 'autk-db';
import { AutkMap } from 'autk-map';
import { renderInsightsWorkspace } from 'autk-provenance';

async function main(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app container');

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(238,243,248,.92);display:flex;align-items:center;justify-content:center;font-size:15px;color:#1b3148;z-index:9999;font-family:system-ui,sans-serif;';
  overlay.textContent = 'Loading Manhattan neighborhood data…';
  document.body.appendChild(overlay);

  const db = new AutkSpatialDb();
  await db.init();
  await db.loadCustomLayer({
    geojsonFileUrl: '/data/mnt_neighs_proj.geojson',
    outputTableName: 'neighborhoods',
  });
  const collection = await db.getLayer('neighborhoods') as FeatureCollection;

  const canvas = document.createElement('canvas');
  const map = new AutkMap(canvas);
  await map.init();
  map.loadCollection('neighborhoods', { collection });
  map.updateRenderInfo('neighborhoods', { renderInfo: { isPick: true } });
  map.draw();

  overlay.remove();

  renderInsightsWorkspace({
    container: root,
    map,
    collection,
    layerId: 'neighborhoods',
    db,
    title: 'Autark Provenance',
    description: 'Manhattan neighborhoods · Scatterplot · Bar Chart · Parallel Coordinates · Histogram - every interaction captured in one shared provenance graph',
  });
}

main();
