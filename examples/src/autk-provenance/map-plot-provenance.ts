import { FeatureCollection } from 'geojson';
import { SpatialDb } from 'autk-db';
import { PlotEvent, Scatterplot } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';
import {
  createAutarkProvenance,
  renderProvenanceTrailUI,
} from 'autk-provenance';

async function main() {
  const db = new SpatialDb();
  await db.init();
  await db.loadCustomLayer({
    geojsonFileUrl: '/data/mnt_neighs_proj.geojson',
    outputTableName: 'neighborhoods',
  });
  const geojson = await db.getLayer('neighborhoods') as FeatureCollection;

  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  const plotBody = document.querySelector('#plotBody') as HTMLElement;
  const trailContainer = document.querySelector('#provenanceTrail') as HTMLElement;

  if (!canvas || !plotBody) {
    console.error('Canvas or plot body not found');
    return;
  }

  const map = new AutkMap(canvas);
  await map.init();
  map.loadGeoJsonLayer('neighborhoods', geojson);
  map.updateRenderInfoProperty('neighborhoods', 'isPick', true);
  map.draw();

  const plotWidth = Math.max(320, Math.floor(plotBody.getBoundingClientRect().width));
  const plotHeight = Math.max(500, Math.floor(plotBody.getBoundingClientRect().height || 500));

  const plot = new Scatterplot({
    div: plotBody,
    data: geojson,
    labels: { axis: ['shape_area', 'shape_leng'], title: 'Plot with provenance' },
    width: plotWidth,
    height: plotHeight,
    events: [PlotEvent.BRUSH],
  });

  map.mapEvents.addEventListener(MapEvent.PICK, (selection: number[]) => {
    plot.setHighlightedIds(selection);
  });
  plot.plotEvents.addEventListener(PlotEvent.BRUSH, (selection: number[]) => {
    const layer = map.layerManager.searchByLayerId('neighborhoods') as VectorLayer | null;
    if (!layer) return;
    if (selection.length === 0) {
      layer.clearHighlightedIds();
    } else {
      layer.setHighlightedIds(selection);
    }
  });

  const provenance = createAutarkProvenance({ map, plot, db });

  const exportBtn = document.querySelector('#exportBtn') as HTMLButtonElement;
  const importBtn = document.querySelector('#importBtn') as HTMLButtonElement;
  const importFile = document.querySelector('#importFile') as HTMLInputElement;

  exportBtn.addEventListener('click', () => {
    const json = provenance.exportGraph();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `provenance-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  importBtn.addEventListener('click', () => importFile.click());

  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const json = e.target?.result as string;
      provenance.importGraph(json);
    };
    reader.readAsText(file);
    importFile.value = '';
  });

  if (trailContainer) {
    renderProvenanceTrailUI({
      provenance,
      container: trailContainer,
      showBackForward: true,
      showTimestamps: true,
      showGraph: true,
      showPathList: true,
    });
  }
}

main();
