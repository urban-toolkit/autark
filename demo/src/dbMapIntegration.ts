import { FeatureCollection } from 'geojson';

import { DbStandalone } from './dbStandalone';

export class DbMapIntegration extends DbStandalone {
  constructor(projection: string = 'EPSG:3395') {
    super(projection);
  }

  async exportLayers(): Promise<{ name: string; data: FeatureCollection }[]> {
    const data = [];
    for (const layerData of this.db.tables) {
      if (layerData.type !== 'custom2DLayer') {
        continue;
      }

      const geojson = await this.db.getLayer(layerData.name);
      data.push({ name: layerData.name, data: geojson });
    }

    return data;
  }
}
