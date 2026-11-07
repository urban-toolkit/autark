/**
 * Built-in plots written as plot definitions.
 *
 * Every built-in plot is registered with the same function as user plots and
 * drawn by the same class (`RegisteredPlot`); the only difference is that
 * their names stay reserved.
 */

import { barchart } from './barchart';
import { boxplot } from './boxplot';
import { bubblechart } from './bubblechart';
import { calendar } from './calendar';
import { chord } from './chord';
import { ecdf, pareto } from './cumulativechart';
import { densitychart } from './densitychart';
import { heatmatrix } from './heatmatrix';
import { hexbin } from './hexbin';
import { areachart, linechart } from './linechart';
import { parallelCoordinates } from './pcoordinates';
import { donutchart, piechart } from './piechart';
import { radar } from './radar';
import { registerBuiltInPlot } from './registered';
import { sankey } from './sankey';
import { scatterplot } from './scatterplot';
import { stackedbar } from './stackedbar';
import { sunburst } from './sunburst';
import { tablevis } from './tablevis';
import { treemap } from './treemap';
import { violin } from './violin';
import { waffle } from './waffle';

for (const definition of [
    barchart, scatterplot, bubblechart, heatmatrix, hexbin, waffle, piechart, donutchart,
    boxplot, calendar, treemap, stackedbar, violin, sunburst,
    linechart, areachart, radar, densitychart, ecdf, pareto,
    sankey, chord, parallelCoordinates, tablevis,
]) {
    registerBuiltInPlot(definition);
}
