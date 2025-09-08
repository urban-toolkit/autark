import * as d3 from 'd3';

import { Feature, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'autk-db';

import { PlotEvent, PlotD3, D3PlotBuilder, PlotStyle } from 'autk-plot';

import { AutkMap, LayerType, ILayerThematic, ThematicAggregationLevel, MapEvent } from 'autk-map';

import { PcChart } from './pc-chart';

export class Urbane {
  protected db!: SpatialDb;
  protected map!: AutkMap;
  protected plot!: PlotD3;

  public async run(): Promise<void> {
    await this.initAutkDb();
    await this.loadThematicData();

    await this.loadAutkMap();
    await this.loadAutkPlot();
  }

  protected async initAutkDb() {
    this.db = new SpatialDb();
    await this.db.init();

    await this.db.loadOsmFromOverpassApi({
      queryArea: {
        geocodeArea: 'New York',
        areas: ['Manhattan Island'],
      },
      outputTableName: 'table_osm',
      autoLoadLayers: {
        coordinateFormat: 'EPSG:3395',
        layers: ['surface', 'parks', 'water', 'roads'] as Array<
          'surface' | 'parks' | 'water' | 'roads' | 'buildings'
        >,
        dropOsmTable: true,
      },
    });

    await this.db.loadCustomLayer({
      geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
      outputTableName: 'neighborhoods',
      coordinateFormat: 'EPSG:3395',
      type: 'boundaries'
    });
  }

  protected async loadThematicData() {
    await this.db.loadCsv({
      csvFileUrl: 'http://localhost:5173/data/noise.csv',
      outputTableName: 'noise',
      geometryColumns: {
        latColumnName: 'Latitude',
        longColumnName: 'Longitude',
        coordinateFormat: 'EPSG:3395',
      },
    });

    await this.db.loadCsv({
      csvFileUrl: 'http://localhost:5173/data/parking.csv',
      outputTableName: 'parking',
      geometryColumns: {
        latColumnName: 'Latitude',
        longColumnName: 'Longitude',
        coordinateFormat: 'EPSG:3395',
      },
    });

    await this.db.loadCsv({
      csvFileUrl: 'http://localhost:5173/data/permit.csv',
      outputTableName: 'permit',
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

    await this.db.spatialJoin({
      tableRootName: 'neighborhoods',
      tableJoinName: 'parking',
      spatialPredicate: 'INTERSECT',
      output: {
        type: 'MODIFY_ROOT',
      },
      joinType: 'LEFT',
      groupBy: {
        selectColumns: [
          {
            tableName: 'parking',
            column: 'Unique Key',
            aggregateFn: 'count',
          },
        ],
      },
    });

    await this.db.spatialJoin({
      tableRootName: 'neighborhoods',
      tableJoinName: 'permit',
      spatialPredicate: 'INTERSECT',
      output: {
        type: 'MODIFY_ROOT',
      },
      joinType: 'LEFT',
      groupBy: {
        selectColumns: [
          {
            tableName: 'permit',
            column: 'PERMIT_SI_NO',
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

    this.map = new AutkMap(canvas);
    await this.map.init(boundingBox);

    this.map.draw();

    await this.loadLayers();
    await this.loadLayerData();

    this.updateMapListeners();
  }

  protected async loadAutkPlot() {
    const plotBdy = document.querySelector('#plotBody') as HTMLDivElement;

    if (!plotBdy) {
      throw new Error('Plot body element not found.');
    }

    this.plot = new PlotD3(plotBdy, this.d3Spec(), [PlotEvent.BRUSH_Y]);

    await this.loadPlotData();
    this.updatePlotListeners();

    this.plot.draw();
    this.floatingPlot();
  }

  // ---- Map helper methods ----

  protected async loadLayers(): Promise<void> {
    const data = [];
    for (const layerData of this.db.getLayerTables()) {

      const geojson = await this.db.getLayer(layerData.name);
      data.push({ props: layerData, data: geojson });
    }

    for (const json of data) {
      console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
      this.map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
    }

    this.map.updateRenderInfoProperty('neighborhoods', 'opacity', 0.75);
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

  protected async updateMapListeners() {
    this.map.mapEvents.addEventListener(MapEvent.PICK, (selection: number[] | string[]) => {
      const selData: GeoJsonProperties[] = (selection as number[]).map(
        (d: number) => this.plot.data[d] as GeoJsonProperties,
      );

      const cGroup = d3.select('#plotGroup');
      const svgs = cGroup.selectAll('path');

      svgs.style('stroke', function (datum: unknown) {
        const dataJd = datum as GeoJsonProperties;

        if (selData.includes(dataJd)) {
          return PlotStyle.highlight
        } else {
          return PlotStyle.default;
        }
      });

      console.log('Plot updated.');
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
    this.plot.plotEvents.addEventListener(PlotEvent.BRUSH_Y, (selection: unknown[]) => {
      const locList: number[] = [];

      selection.forEach((item: unknown) => {
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

        console.log('Map updated.');
      }
    });
  }

  protected d3Spec(): D3PlotBuilder {
    const chart = new PcChart();
    return chart.build;
  }

  // ---- Ui helper methods ----

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
  const example = new Urbane();
  await example.run();
}
main();
