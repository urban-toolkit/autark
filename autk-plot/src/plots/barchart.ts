/**
 * @fileoverview Bar chart of a value per category or per bin.
 *
 * Reads label and value rows: the features as they are, or the bins of a `binning-1d` (or
 * `category-value`) transform. Each bar is a mark; a selection elsewhere fills each bar from its
 * base with the part the selection produces.
 *
 * @example
 * new AutkPlot(plotDiv, {
 *   type: 'barchart',
 *   collection: geojson,
 *   attributes: { axis: ['shape_area', '@transform'] },
 *   transform: { preset: 'binning-1d', options: { bins: 8 } },
 *   labels: { axis: ['area range', 'count'], title: 'Distribution' }
 * });
 */

import * as d3 from 'd3';

import type { AutkDatum } from '../types-plot';

import type { PlotDefinition } from './registered';

/** Bars of a label (`axis[0]`) and a value (`axis[1]`). */
export const barchart: PlotDefinition = {
    name: 'barchart',
    label: 'Barchart',
    annotations: 'reference',
    series: true,
    // A registered transform is read like binning-1d when it yields label and value rows.
    transforms: ['binning-1d', 'category-value'],
    defaults: config => ({
        ...(config.transform ? { labels: { axis: ['label', 'value'], title: 'Distribution' } } : {}),
    }),
    // Without a transform, each feature is a bar: it needs its label and its value.
    validate: config => {
        const fields = (config.attributes?.axis ?? []).filter(field => field !== '@transform');
        if (!config.transform && fields.length < 2) throw new Error('Barchart requires a label and a value (two fields) when it has no transform.');
    },
    // Bars grow from the bottom: the selected part is a slice from the base,
    // even when there are too few bars for the geometry to prove it.
    highlight: { rect: { mode: 'subset', channel: 'length', axis: 'y', anchor: 'end' } },

    draw({ group, rows, seriesGroups, value, width, height, format, hasFormat, axisX, axisY, partRange, tickCount, style, xTickLabel, scaleDomain, visibleRows, setAnnotationObservations }) {
        const label = (row: AutkDatum) => String(value(row, 0));
        const amount = (row: AutkDatum) => Number(value(row, 1)) || 0;
        setAnnotationObservations?.({ axes: ['y'], rows: rows.map(row => {
            const raw = value(row, 1);
            return { y: typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : undefined };
        }) });
        const slots = new Map<AutkDatum, number>();
        seriesGroups?.forEach(({ key, rows: members }, slot) => {
            const categories = new Set<string>();
            for (const row of members) {
                const category = label(row);
                const raw = value(row, 1);
                if (categories.has(category)) throw new Error(`Barchart: duplicate bar for category "${category}", series "${key}".`);
                if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) {
                    throw new Error(`Barchart: category "${category}", series "${key}" requires a finite nonnegative amount.`);
                }
                categories.add(category);
                slots.set(row, slot);
            }
        });

        const padding = style?.barPadding ?? 0.25;
        const xDomain = scaleDomain?.('x', 'categorical');
        const yDomain = scaleDomain?.('y', 'numeric');
        const x = d3.scaleBand(xDomain ?? rows.map(label), [0, width]).padding(padding >= 0 && padding <= 1 ? padding : 0.25);
        const shown = xDomain ? visibleRows?.(row => x(label(row)) !== undefined) ?? rows : rows;
        // A subset statistic (avg, min, max) may exceed every bar.
        const beyond = partRange && !partRange.additive ? partRange.extent[1] : 0;
        const y = d3.scaleLinear(yDomain ?? [0, Math.max(d3.max(rows, amount) ?? 0, 1, beyond)], [height, 0]);
        const baseline = y(0);

        // Keep band keys intact. Shorten floating-point artifacts only on raw numeric labels,
        // and keep the original text if shortening would make two categories look identical.
        const labels = new Map<string, string>();
        const displayCounts = new Map<string, number>();
        if (!xTickLabel && !hasFormat(0)) {
            for (const row of rows) {
                const raw = value(row, 0);
                const key = String(raw);
                if (labels.has(key)) continue;
                const rounded = typeof raw === 'number' && Number.isFinite(raw) && !Number.isInteger(raw)
                    ? Number(raw.toPrecision(15)) : raw;
                const text = typeof raw === 'number' && typeof rounded === 'number'
                    && Math.abs(raw - rounded) <= Math.abs(raw) * Number.EPSILON ? String(rounded) : key;
                labels.set(key, text);
                displayCounts.set(text, (displayCounts.get(text) ?? 0) + 1);
            }
        }
        const tick = xTickLabel ? undefined : format(0, '~s');
        const xAxis = axisX(d3.axisBottom(x).tickSizeOuter(0).tickFormat(key => {
            if (xTickLabel) return xTickLabel(key);
            if (tick && hasFormat(0) && key.trim() !== '' && Number.isFinite(Number(key))) return tick(Number(key));
            const display = labels.get(key) ?? key;
            return displayCounts.get(display) === 1 ? display : key;
        }));
        if (!xTickLabel) {
            xAxis.selectAll('.tick text')
                .style('text-anchor', 'end')
                .attr('dx', '-.8em')
                .attr('dy', '-.40em')
                .attr('transform', 'rotate(-90)');
        }
        // A few counts get whole ticks, never "500m" of a feature.
        axisY(d3.axisLeft(y).ticks(tickCount(y.domain()[1], rows.map(amount), 10)).tickSizeInner(-width).tickFormat(format(1)));

        const barWidth = x.bandwidth() / Math.max(1, seriesGroups?.length ?? 1);
        group.selectAll('rect.autkMark')
            .data(shown)
            .join('rect')
            .attr('class', 'autkMark')
            .attr('x', row => (x(label(row)) ?? 0) + barWidth * (slots.get(row) ?? 0))
            .attr('width', barWidth)
            .attr('y', row => yDomain ? Math.min(baseline, y(amount(row))) : y(amount(row)))
            .attr('height', row => yDomain ? Math.abs(baseline - y(amount(row))) : height - y(amount(row)))
            .style('stroke', '#2f2f2f')
            .append('title')
            .text(row => `${label(row)}: ${d3.format('~s')(amount(row))}`);
    },
};
