/**
 * What code in Try it Yourself (charts and transforms) can read: `d3`, `autk`
 * (this package, `@urban-toolkit/autk-plot`) and `core`
 * (`@urban-toolkit/autk-core`). The built-in charts and transforms read their
 * imports from these, so their code runs here as is.
 */

import * as d3 from 'd3';

import * as core from '@urban-toolkit/autk-core';

import * as autk from '@urban-toolkit/autk-plot';

/**
 * Evaluates lab code as the page does: the body of a function of `d3`,
 * `autk` and `core`.
 *
 * @returns What the code returns (a plot or transform definition, when it is right).
 * @throws What the code throws.
 */
export function evaluateChart(code: string): unknown {
    return new Function('d3', 'autk', 'core', code)(d3, autk, core);
}
