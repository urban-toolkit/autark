import type { FeatureCollection } from 'geojson';
import type { AutkMap } from '@urban-toolkit/autk-map';
import { ColorMapDomainStrategy, ColorMapInterpolator } from '@urban-toolkit/autk-core';

/** Keep numeric labels as categories in the explicit order 3, 1, 2. */
export function colorRoadCategories(map: AutkMap, collection: FeatureCollection): void {
    for (const feature of collection.features) {
        const highway = feature.properties?.highway;
        feature.properties = {
            ...feature.properties,
            highwayGroup: highway === 'primary' ? 3 : highway === 'secondary' ? 1 : 2,
        };
    }

    // The category order deliberately differs from numeric order and uses no zero label.
    map.updateColorMap('roads', { colorMap: {
        interpolator: ColorMapInterpolator.CAT_OBSERVABLE10,
        domainSpec: { type: ColorMapDomainStrategy.USER, params: [3, 1, 2] },
    } });
    map.updateThematic('roads', { collection, property: 'properties.highwayGroup' });
    map.updateRenderInfo('roads', { isColorMap: true });
}
