// Common interface for all examples
import { AutkSpatialDb } from 'autk-db';
import { AutkMap, LayerType, MapStyle } from 'autk-map';
import { CameraMotion, ColorMapDomainStrategy, ColorMapInterpolator } from 'autk-core';
import { ComputeGpgpu } from 'autk-compute';
import { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

const URL = (import.meta as any).env.BASE_URL;


class CameraAnimationVis {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: `${URL}data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
        });

        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();

        this.map.draw();

        await new CameraMotion()
            .zoomOut(4, 2.5)
            .pitch(-45, 2.5, 2000)
            .zoomIn(1.5, 2)
            .play(this.map.camera);
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }
}

class OsmLayersApi {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
            },
            outputTableName: 'table_osm',
            autoLoadLayers: {
                coordinateFormat: 'EPSG:3395',
                layers: ['surface', 'parks', 'water', 'roads', 'buildings'] as Array<
                    'surface' | 'parks' | 'water' | 'roads' | 'buildings'
                >,
                dropOsmTable: true,
            },
        });

        this.map = new AutkMap(canvas);

        await this.map.init();
        await this.loadLayers();

        this.map.draw();

        await new CameraMotion()
            .zoomIn(2.5, 2.5)
            .pitch(-45, 2.5, 300)
            .yaw(-10, 2)
            .play(this.map.camera);    
        }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }
}

class SpatialJoinNear {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadOsm({
            queryArea: {
                geocodeArea: 'New York',
                areas: ['Battery Park City', 'Financial District'],
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

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        const layer = 'table_osm_roads';

        await this.db.spatialQuery({
            tableRootName: layer,
            tableJoinName: 'noise',
            spatialPredicate: 'NEAR',
            nearDistance: 1000,
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

        this.map = new AutkMap(canvas);
        await this.map.init();

        await this.loadLayers();
        await this.updateThematicData(layer);

        this.map.draw();

        await new CameraMotion()
            .zoomIn(2.5, 2.5)
            .pitch(-45, 2.5, 300)
            .yaw(-10, 2)
            .play(this.map.camera);    
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(layer: string = 'table_osm_buildings') {
        const geojson = await this.db.getLayer(layer);

        this.map.updateThematic(layer, { collection: geojson, property: 'properties.sjoin.count.noise' });
        this.map.updateRenderInfo(layer, { isColorMap: true });
    }
}

class Heatmap {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadOsm({
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

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise_manhattan_clean.csv`,
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        console.log('Building heatmap...');
        await this.db.buildHeatmap({
            tableJoinName: 'noise',
            nearDistance: 1000,
            outputTableName: 'heatmap',
            grid: {
                rows: 100,
                columns: 30,
            },
            groupBy: {
                selectColumns: [
                    {
                        tableName: 'noise',
                        column: 'Unique Key',
                        aggregateFn: 'weighted'
                    },
                ],
            },
        });

        this.map = new AutkMap(canvas);
        MapStyle.setPredefinedStyle('light');
        
        await this.map.init();
        await this.loadLayers();

        this.map.draw();

        await new CameraMotion()
            .zoomOut(3.5, 2.5)
            .pitch(-45, 2.5, 2000)
            .yaw(-10, 2)
            .zoomIn(1.5, 2.5)
            .play(this.map.camera);            
    }

    protected async loadLayers(): Promise<void> {
        const propertyPath = 'weighted.noise';

        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);

            if (layerData.type === 'raster') {
                this.map.loadCollection(layerData.name, { collection: geojson, type: 'raster', property: propertyPath });
            }
            else {
                this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            }
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }

        this.map.updateRenderInfo('heatmap', { opacity: 0.5 });
        this.map.updateColorMap('heatmap', { colorMap: { 
            interpolator: ColorMapInterpolator.SEQ_BLUES, 
            domainSpec: { type: ColorMapDomainStrategy.PERCENTILE, params: [0, 99] } 
        } });
    }
}

class ComputeFunction {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new AutkSpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: `${URL}data/mnt_neighs.geojson`,
            outputTableName: 'neighborhoods',
            coordinateFormat: 'EPSG:3395'
        });

        await this.db.loadCsv({
            csvFileUrl: `${URL}data/noise.csv`,
            outputTableName: 'noise',
            geometryColumns: {
                latColumnName: 'Latitude',
                longColumnName: 'Longitude',
                coordinateFormat: 'EPSG:3395',
            },
        });

        let geojson = await this.db.getLayer('neighborhoods');

        const geojsonCompute = new ComputeGpgpu();
        geojson = await geojsonCompute.run({
            collection: geojson,
            variableMapping: {
                x: 'shape_area',
                y: 'shape_leng',
            },
            resultField: 'result',
            // The Isoperimetric Quotient (Compactness/Circularity) 
            wgslBody: 'return (4 * 3.1415927 * x) / (y * y);',
        });

        this.map = new AutkMap(canvas);

        await this.map.init();
        await this.loadLayers();
        await this.updateThematicData(geojson);

        this.map.draw();

        await new CameraMotion()
            .zoomOut(3.5, 2.5)
            .pitch(-45, 2.5, 2000)
            .yaw(-10, 2)
            .zoomIn(1.5, 2.5)
            .play(this.map.camera);            
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });

            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(geojson: FeatureCollection<Geometry, GeoJsonProperties>) {
        this.map.updateThematic('neighborhoods', { collection: geojson, property: 'properties.compute.result' });
        this.map.updateRenderInfo('neighborhoods', { isColorMap: true });
    }
}

interface ExampleRunner {
    run(canvas: HTMLCanvasElement): Promise<void>;
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const EXAMPLE = 'compute-function' as 'camera-animation' | 'osm-layers-api' | 'spatial-join-near' | 'heatmap' | 'compute-function';

    let example: ExampleRunner;
    switch (EXAMPLE) {
        case 'camera-animation':
            example = new CameraAnimationVis();
            break;
        case 'osm-layers-api':
            example = new OsmLayersApi();
            break;
        case 'spatial-join-near':
            example = new SpatialJoinNear();
            break;
        case 'heatmap':
            example = new Heatmap();
            break;
        case 'compute-function':
            example = new ComputeFunction();
            break;
        default:
            example = new CameraAnimationVis();
            break;
    }

    await example.run(canvas);
}
main();
