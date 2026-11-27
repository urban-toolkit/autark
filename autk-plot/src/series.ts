import type { Feature } from 'geojson';
import { ColorMap, ColorMapDomainStrategy, ColorMapInterpolator, valueAtPath } from '@urban-toolkit/autk-core';
import type { ColorMapOptions } from '@urban-toolkit/autk-core';
import type { AutkDatum } from './types-plot';

/** Input group in source order; its rows are the same objects as in the draw context. */
export type PlotSeriesGroup = {
    readonly key: string;
    readonly rows: readonly AutkDatum[];
    readonly color: string;
};

/** Resolves stable group slots and colors without replacing rows or source IDs. */
export function resolveSeries(field: string, features: Feature[], rows: AutkDatum[], palette?: ColorMapOptions) {
    const sourceKeys = features.map(feature => valueAtPath(feature.properties ?? {}, field));
    const keys = [...new Set(sourceKeys.filter((key): key is string => typeof key === 'string' && key.trim() !== ''))];
    const scale = palette?.type !== undefined ? palette : palette?.interpolator ?? ColorMapInterpolator.CAT_OBSERVABLE10;
    const schemeSize = ColorMap.getCategoricalSchemeSize(scale);
    if (schemeSize === null) throw new Error('Plot series require a categorical style.colorMap.');
    if (palette?.domainSpec?.type === ColorMapDomainStrategy.PERCENTILE) {
        throw new Error('Plot series do not support a percentile color domain.');
    }
    const colorKeys = palette?.domainSpec?.type === ColorMapDomainStrategy.USER ? palette.domainSpec.params : keys;
    const colorIndex = new Map<string, number>();
    colorKeys.forEach((key, index) => {
        if (typeof key !== 'string' || !key.trim() || colorIndex.has(key)) {
            throw new Error('Plot series color domain requires unique nonempty string keys.');
        }
        colorIndex.set(key, index);
    });
    const sample = ColorMap.getColorFunction(scale);
    const groups = new Map(keys.map(key => {
        const i = colorIndex.get(key);
        if (i === undefined) throw new Error(`Plot series color domain is missing "${key}".`);
        const { r, g, b } = sample((i % schemeSize) / Math.max(1, schemeSize - 1));
        return [key, { key, rows: [] as AutkDatum[], color: `rgb(${r},${g},${b})` }];
    }));
    const colorByRow = new WeakMap<AutkDatum, string>();
    for (const row of rows) {
        const index = row.autkIds![0];
        const key = sourceKeys[index];
        const group = typeof key === 'string' ? groups.get(key) : undefined;
        if (!group) throw new Error(`Plot attributes.series "${field}" requires a nonempty string key at feature ${index}.`);
        group.rows.push(row);
        colorByRow.set(row, group.color);
    }
    return { groups: [...groups.values()] as readonly PlotSeriesGroup[], colorByRow };
}
