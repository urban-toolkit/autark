import { SpatialDb } from 'autk-db';
import { AutkMap, ColorMapInterpolator, LayerType, MapStyle } from 'autk-map';
import { Feature, GeoJsonProperties } from 'geojson';

export class GeojsonVis {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    public async run(canvas: HTMLCanvasElement): Promise<void> {
        this.db = new SpatialDb();

        await this.db.init();
        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_roads.geojson',
            outputTableName: 'roads',
            coordinateFormat: 'EPSG:3395',
            type: 'lines'
        });

        const boundingBox = await this.db.getBoundingBoxFromLayer('roads');

        this.map = new AutkMap(canvas);
        MapStyle.setPredefinedStyle('light');

        await this.map.init(boundingBox);
        await this.loadLayers();
        await this.updateThematicData('roads');

        this.map.draw();
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, layerData.type as LayerType, geojson);

            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(layer: string = 'neighborhoods', groupById: boolean = false): Promise<void> {
        const geojson = await this.db.getLayer(layer);
        console.log( { geojson  } )

        const getFnv = (feature: Feature): string => {
            const properties = feature.properties as GeoJsonProperties;
            return ['primary', 'secondary'].includes(properties?.highway) ? properties?.highway : 'other';
        };

        this.map.updateRenderInfoProperty(layer, 'colorMapInterpolator', ColorMapInterpolator.OBSERVABLE10);
        this.map.updateGeoJsonLayerThematic(layer, geojson, getFnv, groupById);
    }

}

async function main() {
    const example = new GeojsonVis();
    
    const canvas = document.querySelector('canvas');
    if (!canvas) {
        throw new Error('No canvas found');
    }

    await example.run(canvas);
}
main();
