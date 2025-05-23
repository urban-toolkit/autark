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
            if(layerData.source === 'csv') {
                continue;
            }

            const geojson = await this.db.getLayer(layerData.name);
            data.push({ props: layerData, data: geojson });

            console.log(geojson);
        }

        return data;
    }
}
