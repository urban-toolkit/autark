import { FeatureCollection } from 'geojson';

import { DbStandalone } from './dbStandalone';
import { Table } from '../../utkdb/dist/shared/interfaces';

export class DbMapIntegration extends DbStandalone {
    constructor(projection: string = 'EPSG:3395') {
        super(projection);
    }

    async exportLayers(): Promise<{ props: Table; data: FeatureCollection }[]> {
        const data = [];
        for (const layerData of this.db.tables) {
            const geojson = await this.db.getLayer(layerData.name);

            if(layerData.source !== 'osm') {
                continue;
            }

            data.push({ props: layerData, data: geojson });
        }

        return data;
    }
}
