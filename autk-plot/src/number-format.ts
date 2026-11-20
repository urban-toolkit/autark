import * as d3 from 'd3';

/** The SI prefixes d3 writes for values under one: "500m" for 0.5, which reads like metres. */
const PREFIX_UNDER_ONE = /[yzafpnµμm]$/;

/**
 * Writes a value with an SI format, or with a decimal format where the SI format would give a value under one a
 * prefix: 1500 reads "1.5k", and 0.5 reads "0.5" where the SI format alone gives "500m".
 *
 * @param value - Value to write.
 * @param si - SI format, such as `d3.format('.2s')`.
 * @param decimal - Decimal format used in its place under one, such as `d3.format('.2r')`.
 * @returns The value's text.
 */
export function formatSiOrDecimal(value: number, si: (value: number) => string, decimal: (value: number) => string): string {
    const text = si(value);
    return PREFIX_UNDER_ONE.test(text) ? decimal(value) : text;
}

const siTick = d3.format('~s');
const decimalTick = d3.format('~r');

/**
 * Writes a tick of a plot whose configuration gives no `tickFormats`: with an SI prefix from one up ("1k", "2.5M"),
 * as a decimal under one ("0.5", "0.25").
 *
 * @param value - Tick value.
 * @returns The tick's label.
 */
export function defaultTickFormat(value: d3.NumberValue): string {
    return formatSiOrDecimal(+value, siTick, decimalTick);
}
