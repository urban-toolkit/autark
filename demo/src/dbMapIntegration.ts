import { FeatureCollection, GeoJsonProperties } from 'geojson';

import { DbStandalone } from './dbStandalone';
import { Table } from '../../utkdb/dist/shared/interfaces';
import { ILayerThematic, ThematicAggregationLevel } from 'utkmap';

export class DbMapIntegration extends DbStandalone {
    constructor(projection: string = 'EPSG:3395') {
        super(projection);
    }

    async exportLayers(): Promise<{ props: Table; data: FeatureCollection }[]> {
        const data = [];
        for (const layerData of this.db.tables) {
            if (layerData.source === 'csv') {
                continue;
            }

            const geojson = await this.db.getLayer(layerData.name);
            data.push({ props: layerData, data: geojson });
        }

        return data;
    }

    async updateThematicData(layerName: string = 'neighborhoods') {
        const thematicData: ILayerThematic[] = [];

        const geojson = await this.db.getLayer(layerName);

        if (geojson) {

            for (const feature of geojson.features) {
                const properties = feature.properties as GeoJsonProperties;

                if (!properties) {
                    console.warn(`Feature ${feature.id} has no properties.`);
                    continue;
                }

                const val = properties.sjoin.count || 0;

                thematicData.push({
                    level: ThematicAggregationLevel.AGGREGATION_COMPONENT,
                    values: [val],
                });
            }

            const valMin = Math.min(...thematicData.map(d => d.values[0]));
            const valMax = Math.max(...thematicData.map(d => d.values[0]));

            for (let i = 0; i < thematicData.length; i++) {
                const val = thematicData[i].values[0];
                thematicData[i].values = [(val - valMin) / (valMax - valMin)];
            }
        }

        return thematicData;
    }
}
