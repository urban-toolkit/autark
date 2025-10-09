import { SpatialDb } from 'autk-db';
import { AutkMap, ColorMapInterpolator, LayerType, MapStyle } from 'autk-map';
import { Feature, GeoJsonProperties } from 'geojson';

export class GeojsonVis {
    protected map!: AutkMap;
    protected db!: SpatialDb;

    public async run(): Promise<void> {
        this.db = new SpatialDb();
        await this.db.init();

        await this.db.loadCustomLayer({
            geojsonFileUrl: 'http://localhost:5173/data/mnt_roads.geojson',
            outputTableName: 'roads',
            coordinateFormat: 'EPSG:3395',
            type: 'lines'
        });

        const boundingBox = await this.db.getBoundingBoxFromLayer('roads');
        const canvas = document.querySelector('canvas');

        if (canvas) {
            this.map = new AutkMap(canvas);
            MapStyle.setPredefinedStyle('light');

            await this.map.init(boundingBox);
            await this.loadLayers();
            await this.updateThematicData('roads', false, false);

            this.map.draw();
        }
    }

    protected async loadLayers(): Promise<void> {
        for (const layerData of this.db.getLayerTables()) {
            const geojson = await this.db.getLayer(layerData.name);
            this.map.loadGeoJsonLayer(layerData.name, layerData.type as LayerType, geojson);

            console.log(`Loading layer: ${layerData.name} of type ${layerData.type}`);
        }
    }

    protected async updateThematicData(layer: string = 'neighborhoods', groupById: boolean = false, normalize: boolean = true): Promise<void> {
        const geojson = await this.db.getLayer(layer);
        console.log( { geojson  } )

        const getFnv = (feature: Feature) => {
            const properties = feature.properties as GeoJsonProperties;
            return (['primary', 'secondary'].indexOf(properties?.highway) + 1) * 0.1;
        };
        
        this.map.updateRenderInfoProperty(layer, 'colorMapInterpolator', ColorMapInterpolator.OBSERVABLE10);
        this.map.updateGeoJsonLayerThematic(layer, getFnv, geojson, groupById, normalize);
    }

}

async function main() {
    const example = new GeojsonVis();
    await example.run();
}
main();
