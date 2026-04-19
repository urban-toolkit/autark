import { ComputeRender } from 'autk-compute';
import { ColorMapDomainStrategy } from 'autk-core';
import { AutkSpatialDb } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';
import { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';

export class ComputeRenderOsmSkyExposure {
    protected map!: AutkMap;
    protected db!: AutkSpatialDb;

    protected roadsWithSky!: FeatureCollection<Geometry, GeoJsonProperties>;

    public async loadDb(): Promise<void> {
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
    }

    public async loadCompute(): Promise<void> {
        const roadsGeoJson = await this.db.getLayer('table_osm_roads');
        const buildingsGeoJson = await this.db.getLayer('table_osm_buildings');

        const render = new ComputeRender();
        const roadsWithSkyClasses = await render.run({
            layers: [{
                layerId: 'table_osm_buildings',
                geojson: buildingsGeoJson,
                type: 'buildings',
                layerType: 'buildings',
            }],
            source: roadsGeoJson,
            aggregation: { type: 'classes', includeBackground: true, backgroundLayerType: 'sky' },
            viewSampling: { directions: 1 },
            tileSize: 64,
        });

        this.roadsWithSky = {
            ...roadsWithSkyClasses,
            features: roadsWithSkyClasses.features.map((road) => ({
                ...road,
                properties: {
                    ...road.properties,
                    compute: {
                        ...(road.properties?.compute ?? {}),
                        skyViewFactor: Number(((road.properties as any)?.compute?.render?.classes ?? {}).sky ?? 0),
                    },
                },
            })),
        };
    }

    public async loadMap(canvas: HTMLCanvasElement): Promise<void> {
        this.map = new AutkMap(canvas);
        await this.map.init();
        await this.loadLayers();

        this.map.updateColorMap('table_osm_roads', {
            colorMap: {
                domainSpec: { type: ColorMapDomainStrategy.PERCENTILE, params: [5, 95] },
            },
        });

        this.map.updateThematic('table_osm_roads', {
            collection: this.roadsWithSky,
            property: 'properties.compute.skyViewFactor',
        });

        this.map.updateRenderInfo('table_osm_roads', { isColorMap: true });
        this.map.updateRenderInfo('table_osm_buildings', { opacity: 0.85, isPick: false });

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = layerData.name === 'table_osm_roads'
                ? this.roadsWithSky
                : await this.db.getLayer(layerData.name);
            this.map.loadCollection(layerData.name, { collection: geojson, type: layerData.type as LayerType });
            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        await this.loadDb();
        await this.loadCompute();
        await this.loadMap(canvas);
    }    
}

async function main() {
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    const example = new ComputeRenderOsmSkyExposure();
    await example.run(canvas);
}
main();
