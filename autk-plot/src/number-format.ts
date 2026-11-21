import * as d3 from 'd3';

/** The SI prefixes d3 writes for values under one: "500m" for 0.5, which reads like meters. */
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

// Any decimal of up to 15 significant digits reads back the same from a double, so a category rounded to 15 loses
// only the floating-point noise past them, such as the last digit of 0.1 + 0.2, 0.30000000000000004.
const decimalCategory = d3.format('.15~r');

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

/**
 * Writes a category of a plot whose configuration gives no `tickFormats`: as it is written, the year 2020 and the
 * zip code 10001 with every digit and a bin's label such as "0.40" with its own. Only a number that is not whole,
 * written as JavaScript writes numbers, reads as a decimal rounded to 15 significant digits, with no trailing zeros:
 * 0.30000000000000004 reads "0.3", while 12.3456789, 1234567.5 and a bin's label such as "583912.3" keep every
 * digit. A negative one keeps the hyphen-minus a whole category is written with, so "-0.5" sits beside "-5", where
 * d3 writes its own minus sign.
 *
 * @param category - Category as written.
 * @returns The category's label.
 */
export function defaultCategoryFormat(category: string): string {
    const value = Number(category);
    const fractional = Number.isFinite(value) && !Number.isInteger(value) && String(value) === category;
    if (!fractional) return category;
    return value < 0 ? `-${decimalCategory(-value)}` : decimalCategory(value);
}
