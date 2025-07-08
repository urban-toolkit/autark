import { FeatureCollection } from 'geojson';
import { SpatialDb } from 'autk-db';

export class SpatialJoin {
  protected db!: SpatialDb;
  protected geojson!: FeatureCollection;

  public async run(): Promise<void> {
    this.db = new SpatialDb();
    await this.db.init();

    await this.db.loadCustomLayer({
      geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
      outputTableName: 'neighborhoods',
      coordinateFormat: 'EPSG:3395',
      type: 'features'
    });

    await this.db.loadCsv({
      csvFileUrl: 'http://localhost:5173/data/noise_sample.csv',
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

    this.geojson = await this.db.getLayer('neighborhoods');
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

      console.log(this.geojson);
      if (this.geojson) {
        div.innerHTML += `<p>features[0].properties.sjoin: ${JSON.stringify(this.geojson.features[0].properties?.sjoin || null)}</p>`;
      }

      div.innerHTML += `<p><b>Successfull Spatial Join.</b><p>`;
    }
  }
}

async function main() {
  const example = new SpatialJoin();
  await example.run();
}
main();
