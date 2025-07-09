import { Feature, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'autk-db';
import { PlotEvent, AutkPlot, PlotVega } from 'autk-plot';
import { AutkMap, LayerType, ILayerThematic, ThematicAggregationLevel, MapEvent } from 'autk-map';

import { View } from 'vega';

export class MapVega {
  protected db!: SpatialDb;
  protected map!: AutkMap;
  protected plot!: AutkPlot;

  public async run(): Promise<void> {
    await this.loadUtkDb();
    await this.loadAutkMap();
    await this.loadAutkPlot();
  }

  protected async loadUtkDb() {
    this.db = new SpatialDb();
    await this.db.init();

    await this.db.loadCustomLayer({
      geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
      outputTableName: 'neighborhoods',
      coordinateFormat: 'EPSG:3395',
      type: 'features'
    });

    await this.db.loadCsv({
      csvFileUrl: 'http://localhost:5173/data/noise_sample.csv',
      outputTableName: 'noise',
      geometryColumns: {
        latColumnName: 'Latitude',
        longColumnName: 'Longitude',
        coordinateFormat: 'EPSG:3395',
      },
    });

    await this.db.spatialJoin({
      tableRootName: 'neighborhoods',
      tableJoinName: 'noise',
      spatialPredicate: 'INTERSECT',
      output: {
        type: 'MODIFY_ROOT',
      },
      joinType: 'LEFT',
      groupBy: {
        selectColumns: [
          {
            tableName: 'noise',
            column: 'Unique Key',
            aggregateFn: 'count',
          },
        ],
      },
    });
  }

  protected async loadAutkMap() {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;

    if (!canvas) {
      throw new Error('Canvas element not found.');
    }

    const boundingBox = await this.db.getBoundingBoxFromLayer('neighborhoods');
    console.log('Bounding Box:', boundingBox);

    this.map = new AutkMap(canvas);
    await this.map.init(boundingBox);

    await this.loadLayers();
    await this.loadLayerData();
    this.updateMapListeners('ntaname');

    this.map.draw();
  }

  protected async loadAutkPlot() {
    const plotBdy = document.querySelector('#plotBody') as HTMLDivElement;

    if (!plotBdy) {
      throw new Error('Plot body element not found.');
    }

    this.plot = new PlotVega(plotBdy, this.vegaSpec(), [PlotEvent.BRUSH]);

    await this.loadPlotData();
    this.updatePlotListeners();

    this.plot.draw();
    this.floatingPlot();
  }

  // ---- Map helper methods ----

  protected async loadLayers(): Promise<void> {
    const data = [];
    for (const layerData of this.db.tables) {
      if (layerData.source === 'csv') {
        continue;
      }

      const geojson = await this.db.getLayer(layerData.name);
      data.push({ props: layerData, data: geojson });
    }

    for (const json of data) {
      console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
      this.map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
    }
  }

  protected async loadLayerData(layerId: string = 'neighborhoods') {
    const thematicData: ILayerThematic[] = [];

    const geojson = await this.db.getLayer(layerId);

    if (geojson) {
      for (const feature of geojson.features) {
        const properties = feature.properties as GeoJsonProperties;

        if (!properties) {
          continue;
        }

        const val = properties.sjoin.count.noise || 0;

        thematicData.push({
          level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
          values: [val],
        });
      }

      const valMin = Math.min(...thematicData.map((d) => d.values[0]));
      const valMax = Math.max(...thematicData.map((d) => d.values[0]));

      for (let i = 0; i < thematicData.length; i++) {
        const val = thematicData[i].values[0];
        thematicData[i].values = [(val - valMin) / (valMax - valMin)];
      }
    }

    this.map.updateLayerThematic('neighborhoods', thematicData);
  }

  protected async updateMapListeners(vegaDataKey: string) {
    this.map.mapEvents.addEventListener(MapEvent.PICK, (selection) => {
      const view = this.plot.ref as View;
      const state = view.getState();

      if (!state.data[`brush_store`] || selection.length === 0) {
        state.data[`brush_store`] = [];
      }

      const values = selection.map((id: number | string) => {
        const el = this.plot.data[id as number];
        if (!el) {
          return '';
        } else {
          return el[vegaDataKey];
        }
      });

      state.data[`brush_store`] = {
        values: [values],
        unit: '',
        fields: [
          {
            field: vegaDataKey,
            channel: 'x',
            type: 'E',
          },
        ],
      };
      view.setState(state);

      console.log('Plot updated.');

      view.run();
    });
  }

  // ---- Plot helper methods ----

  protected async loadPlotData(layerId: string = 'neighborhoods') {
    const data = (await this.db.getLayer(layerId)).features.map((f: Feature) => {
      return f.properties;
    });
    this.plot.data = data;
  }

  protected updatePlotListeners(layerId: string = 'neighborhoods') {
    this.plot.plotEvents.addEventListener(PlotEvent.BRUSH, (selection: number[] | string[] | GeoJsonProperties[]) => {
      const locList: number[] = [];

      selection.forEach((item: number | string | GeoJsonProperties) => {
        this.plot.data.forEach((d: GeoJsonProperties, id: number) => {
          if ((item as GeoJsonProperties)?.ntaname === d?.ntaname) {
            locList.push(id);
            return;
          }
        });
      });

      const layer = this.map.layerManager.searchByLayerId(layerId);

      if (layer) {
        layer.layerRenderInfo.isPick = true;

        layer.clearHighlightedIds();
        layer.setHighlightedIds(locList as number[]);

        console.log('Brush: Map updated.');
      }
    });
  }

  protected vegaSpec() {
    return {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      description: 'A simple bar chart with embedded data.',
      data: {
        values: [],
      },
      params: [
        {
          name: 'brush',
          select: {
            type: 'interval',
            encodings: ['x'],
          },
        },
      ],
      width: 450,
      height: 450,
      background: 'rgba(255, 255, 255, 0.85)',
      view: { fill: 'rgba(255, 255, 255, 0.85)' },
      mark: 'bar',
      encoding: {
        x: { field: 'ntaname', type: 'ordinal' },
        y: { field: 'sjoin.count.noise', type: 'quantitative' },
        color: {
          condition: [
            {
              param: 'brush',
              empty: false,
              value: '#5dade2',
            },
          ],
          value: 'lightgray',
        },
      },
    };
  }

  protected floatingPlot() {
    let newX = 0,
      newY = 0,
      startX = 0,
      startY = 0;

    const plot = document.querySelector('#plot') as HTMLDivElement;
    const bar = document.querySelector('#plotBar') as HTMLDivElement;

    bar.addEventListener('mousedown', mouseDown);

    function mouseDown(e: MouseEvent) {
      startX = e.clientX;
      startY = e.clientY;

      document.addEventListener('mousemove', mouseMove);
      document.addEventListener('mouseup', mouseUp);
    }

    function mouseMove(e: MouseEvent) {
      newX = startX - e.clientX;
      newY = startY - e.clientY;

      startX = e.clientX;
      startY = e.clientY;

      plot.style.top = plot.offsetTop - newY + 'px';
      plot.style.left = plot.offsetLeft - newX + 'px';

      e.preventDefault();
      e.stopPropagation();
    }

    function mouseUp() {
      document.removeEventListener('mousemove', mouseMove);
    }

    plot.style.visibility = 'visible';
  }
}

async function main() {
  const example = new MapVega();
  await example.run();
}
main();
