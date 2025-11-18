import * as d3 from 'd3';

import { Feature, GeoJsonProperties } from 'geojson';

import { SpatialDb } from 'autk-db';

import { PlotEvent, PlotD3, PlotStyle, AutkPlot, Scatterplot } from 'autk-plot';

import { AutkMap, LayerType, MapEvent } from 'autk-map';

export class MapD3 {
    protected db!: SpatialDb;
    protected map!: AutkMap;
    protected plot!: PlotD3;

    protected mapX!: d3.ScaleLinear<number, number>;
    protected mapY!: d3.ScaleLinear<number, number>;

    public async run(): Promise<void> {
        await this.loadAutkDb();
        await this.loadAutkMap();
        await this.loadAutkPlot();
    }

    protected async loadAutkDb() {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
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

        this.map = new AutkMap(canvas);
        await this.map.init();

        await this.loadLayers();
        await this.loadLayerData();
        // this.updateMapListeners();

        this.map.draw();
    }

    protected async loadAutkPlot() {

        const plotBdy = document.querySelector('#plotBody') as HTMLDivElement;

        if (!plotBdy) {
            throw new Error('Plot body element not found.');
        }

        const data = await this.db.getLayer('neighborhoods');
        const plotData = data.features.map((f: Feature) => {
            return f.properties;
        })

        // Goal signature
        const plot: any = new Scatterplot( plotBdy, plotData );

        // this.plot = new PlotD3(plotBdy, this.scatterPlot.bind(this), [PlotEvent.BRUSH]);

        // await this.loadPlotData();
        // this.updatePlotListeners();

        // this.plot.draw();
        this.floatingPlot();
    }

    // ---- Map helper methods ----

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, geojson, layerData.type as LayerType);
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateRenderInfoProperty('neighborhoods', 'opacity', 0.75);
    }

    protected async loadLayerData(layerId: string = 'neighborhoods') {
        const geojson = await this.db.getLayer(layerId);

        const getFnv = (feature: Feature) => {
            const properties = feature.properties as GeoJsonProperties;
            return properties?.sjoin.count.noise || 0;
        };

        this.map.updateGeoJsonLayerThematic(layerId, geojson, getFnv);
    }

    // protected async updateMapListeners() {
    //     this.map.mapEvents.addEventListener(MapEvent.PICK, (selection: number[] | string[]) => {
    //         this.highlightSelectedMarks(selection as number[]);
    //         console.log('Plot updated.');
    //     });
    // }

    // ---- Plot helper methods ----

    // protected async loadPlotData(layerId: string = 'neighborhoods') {
    //     const data = await this.db.getLayer(layerId);

    //     this.plot.data = data.features.map((f: Feature) => {
    //         return f.properties;
    //     });

    // }

    // protected updatePlotListeners(layerId: string = 'neighborhoods') {
    //     this.plot.plotEvents.addEventListener(PlotEvent.BRUSH, (selection: unknown[]) => {
    //         const locList: number[] = [];

    //         selection.forEach((item: unknown) => {
    //             const currentSel = item as number[][];

    //             this.plot.data.forEach((d: GeoJsonProperties, id: number) => {
    //                 const xVal = this.mapX(+d?.shape_area || 0);
    //                 const yVal = this.mapY(+d?.shape_leng || 0);

    //                 if (xVal >= currentSel[0][0] &&
    //                     xVal <= currentSel[1][0] &&
    //                     yVal >= currentSel[0][1] &&
    //                     yVal <= currentSel[1][1]) {
    //                     locList.push(id);
    //                     return;
    //                 }
    //             });
    //         });

    //         this.highlightSelectedBoundaries(layerId, locList);
    //         // this.highlightSelectedMarks(locList);
    //         console.log('Map updated.');
    //     });
    // }

    // ---- Highlight methods ----

    // protected highlightSelectedMarks(locList: number[]) {
    //     const svgs = d3.selectAll('.autkMark');
    //     const grps = d3.selectAll<SVGGElement, unknown>('.autkBrushable');

    //     svgs.style('fill', function (_d: unknown, id: number) {
    //         if (locList.includes(id)) {
    //             return PlotStyle.highlight;
    //         } else {
    //             return PlotStyle.default;
    //         }
    //     });

    //     if (locList.length === 0) {
    //         grps.call(d3.brush().move, null);
    //     }
    // }

    // protected highlightSelectedBoundaries(layerId: string = 'neighborhoods', locList: number[]) {
    //     const layer = this.map.layerManager.searchByLayerId(layerId);
    //     if (layer) {
    //         layer.layerRenderInfo.isPick = true;

    //         layer.clearHighlightedIds();
    //         layer.setHighlightedIds(locList);
    //     }
    // }

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
