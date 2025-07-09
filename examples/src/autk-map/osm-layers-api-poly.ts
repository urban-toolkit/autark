import { AutkMap, LayerType } from 'autk-map';
import { SpatialDb } from 'autk-db';

export class OsmLayersApi {
  protected map!: AutkMap;
  protected db!: SpatialDb;

  public async run(): Promise<void> {
    this.db = new SpatialDb();
    await this.db.init();

    await this.db.loadOsmFromOverpassApi({
      polygon: [
        [-74.006507414, 40.6963494934],
        [-74.0262219458, 40.7000278019],
        [-74.0186055774, 40.7425129106],
        [-73.9680946755, 40.7355983529],
        [-73.9738489526, 40.7090665214],
        [-73.9961058937, 40.7060225978],
        [-74.006507414, 40.6963494934],
      ],
      outputTableName: 'table_osm',
      autoLoadLayers: {
        coordinateFormat: 'EPSG:3395',
        layers: ['coastline', 'parks', 'water', 'roads', 'buildings'] as Array<
          'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'
        >,
        dropOsmTable: true,
      },
    });

    const canvas = document.querySelector('canvas');
    if (canvas) {
      this.map = new AutkMap(canvas);

      await this.map.init(this.db.getOsmBoundingBox());
      await this.loadLayers();

      this.map.draw();
    }
  }

  async loadLayers(): Promise<void> {
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
}

async function main() {
  const example = new OsmLayersApi();
  await example.run();
}
main();
