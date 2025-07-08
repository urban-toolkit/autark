import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';

export class GeojsonVis {
  protected map!: AutkMap;
  protected db!: SpatialDb;

  public async run(): Promise<void> {
    this.db = new SpatialDb();
    await this.db.init();

    await this.db.loadOsmFromOverpassApi({
        boundingBox: {
            minLon: -74.0217296397,
            minLat: 40.6989916231,
            maxLon: -74.0005168092,
            maxLat: 40.7131479624,
        }, outputTableName: 'table_osm',
        autoLoadLayers: {
            coordinateFormat: 'EPSG:3395',
            layers: [
                'coastline',
                'parks',
                'water',
                'roads',
            ] as Array<'surface' | 'coastline' | 'parks' | 'water' | 'roads' | 'buildings'>,
            dropOsmTable: true,
        },
    });

    const boundingBox = await this.db.getOsmBoundingBox();
    console.log('Bounding Box:', boundingBox);

    await this.db.loadCsv({
      csvFileUrl: 'http://localhost:5173/data/noise_sample.csv',
      outputTableName: 'noise',
      geometryColumns: {
        latColumnName: 'Latitude',
        longColumnName: 'Longitude',
        coordinateFormat: 'EPSG:3395',
      },
    });

    await this.db.loadGridLayer({
        boundingBox: boundingBox,
        outputTableName: 'grid',
        rows: 10,
        columns: 10
    })

    // console.log('Grid Layer:', grid);

    const canvas = document.querySelector('canvas');

    if (canvas) {
      canvas.width = canvas.height = canvas.parentElement?.clientHeight || 800;
      this.map = new AutkMap(canvas);

      await this.map.init(boundingBox);
      await this.loadLayers();

      this.map.draw();
    }
  }

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
}

async function main() {
  const example = new GeojsonVis();
  await example.run();
}
main();
