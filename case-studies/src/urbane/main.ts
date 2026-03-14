
import { FeatureCollection } from 'geojson';

import { ParallelCoordinates, TableVis, PlotEvent } from 'autk-plot';
import { AutkMap, MapEvent, VectorLayer } from 'autk-map';

export class MapParallelCoordinates {
  protected map!: AutkMap;

  protected table!: TableVis;
  protected parallel!: ParallelCoordinates;

  protected neighs!: FeatureCollection;
  protected datasets!: {
    [key: string]: FeatureCollection;
  }

  public async loadData() {
    this.neighs = await fetch('http://localhost:5173/data/mnt_neighs_proj.geojson').then(res => res.json());

    this.datasets['crime'] = await fetch('http://localhost:5173/data/mnt_crime_proj.geojson').then(res => res.json());
    this.datasets['noise'] = await fetch('http://localhost:5173/data/mnt_noise_proj.geojson').then(res => res.json());
    this.datasets['subway'] = await fetch('http://localhost:5173/data/mnt_subway_proj.geojson').then(res => res.json());
    this.datasets['taxi'] = await fetch('http://localhost:5173/data/mnt_taxi_proj.geojson').then(res => res.json());
    this.datasets['restaurants'] = await fetch('http://localhost:5173/data/mnt_restaurants_proj.geojson').then(res => res.json());
  }


  public async run(canvas: HTMLCanvasElement, plotDiv: HTMLElement): Promise<void> {

    await this.loadAutkMap(canvas);
    await this.loadAutkPlot(plotDiv);

    this.updateMapListeners();
    this.updatePlotListeners();
  }

  protected async loadAutkMap(canvas: HTMLCanvasElement) {
    this.map = new AutkMap(canvas);
    await this.map.init();

    this.map.loadGeoJsonLayer('neighborhoods', this.neighs);
    this.map.updateRenderInfoProperty('neighborhoods', 'isPick', true);

    this.map.draw();
  }

  protected async loadAutkPlot(plotDiv: HTMLElement) {
    this.parallel = new ParallelCoordinates({
      div: plotDiv,
      data: this.neighs,
      labels: {
        axis: ['shape_area', 'shape_leng', 'cdta2020'],
        title: 'Neighborhood Characteristics'
      },
      width: 790,
      events: [PlotEvent.BRUSH_Y]
    });
  }

  protected async updateMapListeners() {
    this.map.mapEvents.addEventListener(MapEvent.PICK, (selection: number[]) => {
      this.parallel.setHighlightedIds(selection);
    });
  }

  protected updatePlotListeners(layerId: string = 'neighborhoods') {
    this.parallel.plotEvents.addEventListener(PlotEvent.CLICK, (selection: number[]) => {
      const layer = <VectorLayer>this.map.layerManager.searchByLayerId(layerId);
      if (layer) {
        layer.setHighlightedIds(selection);
      }
    });
  }

}

async function main() {
  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  const plotBdy = document.querySelector('#plotBody') as HTMLElement;

  if (!canvas || !plotBdy) {
    console.error('Canvas or plot body element not found');
    return;
  }

  const example = new MapParallelCoordinates();

  await example.loadData();
  await example.run(canvas, plotBdy);
}
main();
