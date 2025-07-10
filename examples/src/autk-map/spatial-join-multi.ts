import { SpatialDb } from 'autk-db';
import { AutkMap, LayerType, ILayerThematic, ThematicAggregationLevel } from 'autk-map';

import { GeoJsonProperties } from 'geojson';

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
      type: 'features'
    });

    const boundingBox = await this.db.getBoundingBoxFromLayer('neighborhoods');
    console.log('Bounding Box:', boundingBox);

    await this.db.loadCsv({
      csvFileUrl: 'http://localhost:5173/data/noise.csv',
      outputTableName: 'noise',
      geometryColumns: {
        latColumnName: 'Latitude',
        longColumnName: 'Longitude',
        coordinateFormat: 'EPSG:3395',
      },
    });

    await this.db.loadCsv({
      csvFileUrl: 'http://localhost:5173/data/parking.csv',
      outputTableName: 'parking',
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

    await this.db.spatialJoin({
      tableRootName: 'neighborhoods',
      tableJoinName: 'parking',
      spatialPredicate: 'INTERSECT',
      output: {
        type: 'MODIFY_ROOT',
      },
      joinType: 'LEFT',
      groupBy: {
        selectColumns: [
          {
            tableName: 'parking',
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
      await this.updateThematicData('noise');

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

  protected async updateThematicData(property: string) {
    const thematicData: ILayerThematic[] = [];

    const geojson = await this.db.getLayer('neighborhoods');

    if (geojson) {
      for (const feature of geojson.features) {
        const properties = feature.properties as GeoJsonProperties;

        if (!properties) {
          continue;
        }

        const val = properties.sjoin.count[property] || 0;

        thematicData.push({
          level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
          values: [val],
        });
      }

      const valMin = Math.min(...thematicData.map((d) => d.values[0]));
      const valMax = Math.max(...thematicData.map((d) => d.values[0]));

      for (let i = 0; i < thematicData.length; i++) {
        const val = thematicData[i].values[0];
        thematicData[i].values = [(val - valMin) / (valMax - valMin)];
      }
    }

    this.map.updateLayerThematic('neighborhoods', thematicData);
  }

  uiUpdate() {
    document.querySelector('select')?.addEventListener('change', async (event) => {
      const select = event.target as HTMLSelectElement;
      const value = select.value;

      this.updateThematicData(value);
    });
  }
}

async function main() {
  const example = new SpatialJoin();
  await example.run();
  example.uiUpdate();
}

main();
