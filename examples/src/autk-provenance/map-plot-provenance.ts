import { FeatureCollection } from 'geojson';
import { PlotEvent, Scatterplot } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';
import {
  createAutarkProvenance,
  renderProvenanceTrailUI,
} from 'autk-provenance';

async function main() {
  const geojson = await fetch('http://localhost:5173/data/mnt_neighs_proj.geojson').then(
    (res) => res.json() as Promise<FeatureCollection>
  );

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

  const plot = new Scatterplot({
    div: plotBody,
    data: geojson,
    labels: { axis: ['shape_area', 'shape_leng'], title: 'Plot with provenance' },
    width: 790,
    events: [PlotEvent.BRUSH],
  });

  map.mapEvents.addEventListener(MapEvent.PICK, (selection: number[]) => {
    plot.setHighlightedIds(selection);
  });
  plot.plotEvents.addEventListener(PlotEvent.BRUSH, (selection: number[]) => {
    const layer = map.layerManager.searchByLayerId('neighborhoods') as VectorLayer | null;
    if (layer) layer.setHighlightedIds(selection);
  });

  const provenance = createAutarkProvenance({ map, plot });

  if (trailContainer) {
    renderProvenanceTrailUI({
      provenance,
      container: trailContainer,
      showBackForward: true,
      showTimestamps: true,
    });
  }
}

main();
