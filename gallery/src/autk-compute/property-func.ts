import { AutkSpatialDb } from 'autk-db';
import { ComputeGpgpu } from 'autk-compute';

export class LoadGeojson {
  protected db!: AutkSpatialDb;

  public async run(): Promise<void> {
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
        layers: ['buildings'] as Array<'surface' | 'parks' | 'water' | 'roads' | 'buildings'>,
        dropOsmTable: true,
      },
    });

    let geojson = await this.db.getLayer('table_osm_buildings');
    console.log({ initialGeojson: geojson });

    const geojsonCompute = new ComputeGpgpu();
    geojson = await geojsonCompute.exec({
      collection: geojson,
      variableMapping: {
        x: 'height',
        y: 'height',
      },
      resultField: 'height_sq',
      wgslBody: 'return x * y;',
    });

    console.log({ computedGeojson: geojson });
  }

  public print(): void {
    const div = document.getElementById('output');
    if (div) {
      const tables = this.db.tables;

      div.innerHTML += `<ul>`;
      for (const table of tables) {
        div.innerHTML += `<li>${table.name}: (${table.source}, ${table.type}) </li>`;
      }
      div.innerHTML += `</ul>`;

      div.innerHTML += `<p>Number of tables: ${tables.length}</p>`;
      div.innerHTML += `<p><b>Successfully computed new property.</b><p>`;
    }
  }
}

async function main() {
  const example = new LoadGeojson();

  await example.run();
  example.print();
}

main();
