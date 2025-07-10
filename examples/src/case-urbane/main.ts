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

    const poly = [ 
        [-74.0098046562, 40.6982049132], [-74.0173958535, 40.6986856171],
        [-74.0216331872, 40.7025239325], [-74.0219950265, 40.7083946436],
        [-74.0143980318, 40.7540111342], [-73.9869222433, 40.7924563882],
        [-73.9500574672, 40.8463983028], [-73.9493480869, 40.8536723786],
        [-73.9417061996, 40.8583232324], [-73.9308342527, 40.8765152436],
        [-73.9266559744, 40.8782715825], [-73.9221472599, 40.8778872420],
        [-73.9193176727, 40.8755000328], [-73.9174980835, 40.8750547945],
        [-73.9146191688, 40.8747858436], [-73.9117395904, 40.8742723586],
        [-73.9098029866, 40.8725982360], [-73.9097395023, 40.8703986799],
        [-73.9107798047, 40.8673024509], [-73.9185602847, 40.8588289830],
        [-73.9273616016, 40.8474465124], [-73.9317241031, 40.8399568508],
        [-73.9344043805, 40.8338171335], [-73.9328769962, 40.8166091057],
        [-73.9333600964, 40.8099408536], [-73.9302281292, 40.8048821714],
        [-73.9280603716, 40.8016814105], [-73.9251708074, 40.8022535111],
        [-73.9230418335, 40.8021270551], [-73.9220368765, 40.8016953814],
        [-73.9216638703, 40.8013961977], [-73.9210757936, 40.8006078335],
        [-73.9206941310, 40.7998876528], [-73.9202586190, 40.7994745056],
        [-73.9195026208, 40.7990901909], [-73.9184042053, 40.7986252568],
        [-73.9164809869, 40.7979028511], [-73.9146705860, 40.7966850582],
        [-73.9131729930, 40.7941251661], [-73.9148372027, 40.7916845941],
        [-73.9195994292, 40.7873362515], [-73.9228753042, 40.7829475341],
        [-73.9261584059, 40.7808818532], [-73.9287918029, 40.7800126817],
        [-73.9374809140, 40.7792424566], [-73.9400470621, 40.7762348909],
        [-73.9380275372, 40.7700409060], [-73.9418763328, 40.7677432364],
        [-73.9455524893, 40.7636939192], [-73.9501122665, 40.7585326044],
        [-73.9599254882, 40.7481277900], [-73.9638667259, 40.7502915133],
        [-73.9699959119, 40.7432562180], [-73.9712422751, 40.7412039424],
        [-73.9713385313, 40.7361020289], [-73.9700743522, 40.7304620183],
        [-73.9706094327, 40.7220490299], [-73.9763274468, 40.7090753770],
        [-73.9873517511, 40.7073920194], [-73.9985351945, 40.7055388655],
        [-74.0051256879, 40.7007701363], [-74.0098046562, 40.6982049132]
    ];

    // await this.db.loadOsmFromOverpassApi({
    //   polygon: poly,
    //   outputTableName: 'table_osm',
    //   autoLoadLayers: {
    //     coordinateFormat: 'EPSG:3395',
    //     layers: ['coastline', 'parks', 'water', 'roads'] as Array<
    //       'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'
    //     >,
    //     dropOsmTable: true,
    //   },
    // });

    await this.db.loadCustomLayer({
      geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
      outputTableName: 'neighborhoods',
      coordinateFormat: 'EPSG:3395',
      type: 'features'
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

    this.map.updateRenderInfoOpacity('neighborhoods', 0.75);
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

      this.plot.locList = selData;
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
    this.plot.plotEvents.addEventListener(PlotEvent.BRUSH_Y, (selection: number[] | string[] | GeoJsonProperties[]) => {
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
