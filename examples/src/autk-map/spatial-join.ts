import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType } from 'autk-map';

import { Feature, GeoJsonProperties } from 'geojson';

export class SpatialJoin {
  protected map!: AutkMap;
  protected db!: SpatialDb;

  public async run(): Promise<void> {
    this.db = new SpatialDb();
    await this.db.init();

    await this.db.loadCustomLayer({
      geojsonFileUrl: 'http://localhost:5173/data/mnt_neighs.geojson',
      outputTableName: 'neighborhoods',
      coordinateFormat: 'EPSG:3395',
      type: 'boundaries'
    });

    const boundingBox = await this.db.getBoundingBoxFromLayer('neighborhoods');

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

    const canvas = document.querySelector('canvas');
    if (canvas) {
      this.map = new AutkMap(canvas);
      await this.map.init(boundingBox);

      await this.loadLayers();
      await this.updateThematicData();

      this.map.draw();
    }
  }

  protected async loadLayers(): Promise<void> {
    const data = [];
    for (const layerData of this.db.getLayerTables()) {

      const geojson = await this.db.getLayer(layerData.name);
      data.push({ props: layerData, data: geojson });
    }

    for (const json of data) {
      console.log(`Loading layer: ${json.props.name} of type ${json.props.type}`);
      this.map.loadGeoJsonLayer(json.props.name, json.props.type as LayerType, json.data);
    }
  }

  protected async updateThematicData() {
        const geojson = await this.db.getLayer('neighborhoods');

        const getFnv = (feature: Feature) => {
            const properties = feature.properties as GeoJsonProperties;
            return properties?.sjoin.count.noise || 0;
        };

        this.map.updateGeoJsonLayerThematic('neighborhoods', getFnv, geojson);
  }
}

async function main() {
  const example = new SpatialJoin();
  await example.run();
}
main();
