/**
 * Built-in transforms written as transform definitions.
 *
 * Every built-in transform is registered with the same function as user
 * transforms and run by the same code (`runTransform`); the only difference
 * is that their names stay reserved.
 */

import { binning1d } from './presets/binning-1d';
import { binning2d } from './presets/binning-2d';
import { binningEvents } from './presets/binning-events';
import { binningHex } from './presets/binning-hex';
import { boxStats } from './presets/box-stats';
import { cumulative } from './presets/cumulative';
import { density } from './presets/density';
import { flows } from './presets/flows';
import { fold } from './presets/fold';
import { hierarchy } from './presets/hierarchy';
import { reduceSeries } from './presets/reduce-series';
import { sort } from './presets/sort';
import { registerBuiltInTransform } from './registry';

for (const definition of [
    binning1d, binning2d, sort, binningEvents, reduceSeries, boxStats,
    flows, binningHex, hierarchy, cumulative, fold, density,
]) {
    registerBuiltInTransform(definition);
}
