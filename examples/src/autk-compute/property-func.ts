import { SpatialDb } from 'autk-db';
import { GeojsonCompute } from 'autk-compute';

export class LoadGeojson {
  protected db!: SpatialDb;

  public async run(): Promise<void> {
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
        layers: ['buildings'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
        dropOsmTable: true,
      },
    });

    let geojson = await this.db.getLayer('table_osm_buildings');
    console.log({ initialGeojson: geojson });

    const geojsonCompute = new GeojsonCompute();
    geojson = await geojsonCompute.computeFunctionIntoProperties({
      geojson,
      variableMapping: {
        x: 'height',
        y: 'height',
      },
      outputColumnName: 'heightCalculated',
      wglsFunction: 'x * y',
    });

    console.log({ computedGeojson: geojson });
  }
}

async function main() {
  const example = new LoadGeojson();

  await example.run();
}

main();
