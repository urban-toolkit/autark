import * as d3 from 'd3';

import { Feature, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'autk-db';

import { PlotEvent, PlotD3, D3PlotBuilder, PlotStyle } from 'autk-plot';

import { AutkMap, LayerType, ILayerThematic, ThematicAggregationLevel, MapEvent } from 'autk-map';

export class MapD3 {
  protected db!: SpatialDb;
  protected map!: AutkMap;
  protected plot!: PlotD3;

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
      csvFileUrl: 'http://localhost:5173/data/noise.csv',
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
    this.updateMapListeners();

    this.map.draw();
  }

  protected async loadAutkPlot() {
    const plotBdy = document.querySelector('#plotBody') as HTMLDivElement;

    if (!plotBdy) {
      throw new Error('Plot body element not found.');
    }

    this.plot = new PlotD3(plotBdy, this.d3Spec(), [PlotEvent.CLICK]);

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

      const groups = this.plot.refs as SVGGElement[];

      // only one click area expected.
      const cGroup = d3.select(groups[0]);
      const svgs = cGroup.selectAll('rect');

      svgs.style('fill', function (datum: unknown) {
        const dataJd = datum as GeoJsonProperties;

        if (selData.includes(dataJd)) {
          return PlotStyle.highlight;
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
    this.plot.plotEvents.addEventListener(PlotEvent.CLICK, (selection: number[] | string[] | GeoJsonProperties[]) => {
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
    return this.barChart;
  }

  protected barChart<SVGRectElement>(div: HTMLElement, data: GeoJsonProperties[]): [SVGGElement[], SVGRectElement[]] {
    const margens = { left: 40, right: 25, top: 10, bottom: 225 };

    const svg = d3
      .select(div)
      .selectAll('#plot')
      .data([0])
      .join('svg')
      .attr('id', 'plot')
      .style('width', `calc(${div.offsetWidth}px - 4px)`)
      .style('height', '500px')
      .style('visibility', 'visible');

    const node = svg.node();

    if (!svg || !node) {
      throw new Error('SVG element could not be created.');
    }

    // ---- Tamanho do Gráfico
    const width = div.offsetWidth - margens.left - margens.right;
    const height = 500 - margens.top - margens.bottom;

    // ---- Escalas
    const xExtent = Array.from(new Set(data.map((d) => d?.ntaname.substring(0, 50))));
    const mapX = d3.scaleBand().domain(xExtent).range([0, width]).padding(0.25);

    const yExtent = <[number, number]>d3.extent(data, (d) => +(d?.sjoin.count.noise || 0));
    const mapY = d3.scaleLinear().domain(yExtent).range([height, 0]);

    // ---- Eixos
    const xAxis = d3.axisBottom(mapX).tickSizeOuter(0);

    const xAxisSelection = svg
      .selectAll<SVGGElement, unknown>('#axisX')
      .data([0])
      .join('g')
      .attr('id', 'axisX')
      .attr('class', 'x axis')
      .attr('transform', `translate(${margens.left}, ${500 - margens.bottom})`)
      .style('visibility', 'visible');

    xAxisSelection
      .call(xAxis)
      .selectAll('text')
      .style('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '-.40em')
      .attr('transform', 'rotate(-90)');

    const yAxis = d3.axisLeft(mapY).tickSizeInner(-width).tickFormat(d3.format('.2s'));

    const yAxisSelection = svg
      .selectAll<SVGGElement, unknown>('#axisY')
      .data([0])
      .join('g')
      .attr('id', 'axisY')
      .attr('class', 'y axis')
      .attr('transform', `translate(${margens.left}, ${margens.top})`)
      .style('visibility', 'visible');
    yAxisSelection.call(yAxis);

    // Y axis label:
    yAxisSelection
      .append('text')
      .attr('class', 'title')
      .attr('text-anchor', 'end')
      .attr('transform', 'rotate(-90)')
      .attr('y', -margens.left / 2 - 7)
      .attr('x', -margens.top)
      .style('visibility', 'visible')
      .text('sjoin.count.noise');

    // ---- Círculos
    const cGroup = svg
      .selectAll('#plotGroup')
      .data([0])
      .join('g')
      .attr('id', 'plotGroup')
      .attr('transform', `translate(${margens.left}, ${margens.top})`);

    const svgs = cGroup
      .selectAll('rect')
      .data(data)
      .join('rect')
      .attr('x', (d: GeoJsonProperties) => mapX(d?.ntaname.substring(0, 50)) || 'unknown')
      .attr('y', (d: GeoJsonProperties) => mapY(d?.sjoin.count.noise || 0))
      .attr('height', (d) => mapY(0) - mapY(d?.sjoin.count.noise || 0))
      .attr('width', mapX.bandwidth())
      .style('fill', 'lightgray')
      .style('stroke', '#2f2f2f')
      .style('visibility', 'visible');

    return [cGroup.nodes() as SVGGElement[], svgs.nodes() as SVGRectElement[]];
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
  const example = new MapD3();
  await example.run();
}
main();
