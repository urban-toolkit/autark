import * as d3 from 'd3';
import type { AnnotationStatistic, PlotAnnotationObservations } from './annotation-statistics';
import { annotationStatistics } from './annotation-statistics';

/** Numeric value or raw category key in the plot's coordinate system. */
export type AnnotationCoordinate = number | string;

type Interval = readonly [AnnotationCoordinate, AnnotationCoordinate];
type OnAxis<T> = { x: T; y?: never } | { x?: never; y: T };

/** A reference mark. It does not contribute data, selection, or domain bounds. */
export type PlotAnnotation = { id: string; label?: string; color?: string } & (
    | ({ type: 'line'; fit?: never } & OnAxis<AnnotationCoordinate>)
    | { type: 'line'; fit: 'linear'; x?: never; y?: never }
    | { type: 'point'; x: AnnotationCoordinate; y: AnnotationCoordinate; series?: never }
    | { type: 'point'; x: string; series: string; y?: never }
    | ({ type: 'band' } & OnAxis<Interval>)
);

/** Explicit plot-local coordinates for an axis whose scale is not its position mapping. */
export type PlotAnnotationAxis = {
    kind: 'numeric' | 'categorical';
    position: (value: AnnotationCoordinate) => number | undefined;
    /** Outer edges of a category's slot, required for categorical bands. */
    bounds?: (key: string) => readonly [number, number] | undefined;
};

/** Looks up an actual plotted point by series and raw X key. */
export type PlotAnnotationSeriesPoint = (series: string, x: string) => { x: number; y: number; color?: string } | undefined;

type Axes = Partial<Record<'x' | 'y', PlotAnnotationAxis>>;
type Layer = d3.Selection<SVGGElement, number, HTMLElement, unknown>;

type AnnotationLayout = {
    axes: Axes;
    seriesPoint?: PlotAnnotationSeriesPoint;
    observations?: PlotAnnotationObservations;
};

function isStatistic(value: unknown): value is AnnotationStatistic {
    return value === 'min' || value === 'max' || value === 'mean';
}

/** Derives an annotation mapping from the standard positional axes. */
export function annotationAxis<Domain extends d3.AxisDomain>(scale: d3.AxisScale<Domain>, length: number): PlotAnnotationAxis | undefined {
    const domain = scale.domain();
    if ('invert' in scale && 'clamp' in scale && domain.every(value => typeof value === 'number')) {
        const numeric = (scale as unknown as d3.ScaleLinear<number, number>).copy().clamp(false);
        return { kind: 'numeric', position: value => typeof value === 'number'
            && (domain[0] !== domain[domain.length - 1] || value === domain[0]) ? numeric(value) : undefined };
    }
    if (typeof scale.bandwidth !== 'function' || !domain.every(key => typeof key === 'string')) return undefined;
    const categorical = scale.copy() as unknown as d3.AxisScale<string>;
    const bandwidth = scale.bandwidth();
    const positions = domain.map(key => ({ key: String(key), pixel: categorical(String(key))! }))
        .sort((a, b) => a.pixel - b.pixel);
    const bounds = new Map(positions.map(({ key, pixel }, i) => [key, bandwidth > 0
        ? [pixel, pixel + bandwidth] as const
        : [i > 0 ? (positions[i - 1].pixel + pixel) / 2 : 0,
            i < positions.length - 1 ? (pixel + positions[i + 1].pixel) / 2 : length] as const]));
    return {
        kind: 'categorical',
        position: key => typeof key === 'string' && bounds.has(key) ? categorical(key)! + bandwidth / 2 : undefined,
        bounds: key => bounds.get(key),
    };
}

/** Validates the entire list and snapshots it before the caller replaces the overlay. */
export function validateAnnotations(list: readonly PlotAnnotation[], layout: AnnotationLayout | undefined): PlotAnnotation[] {
    const { axes, seriesPoint, observations } = layout ?? {};
    if (!Array.isArray(list)) throw new Error('Plot annotations must be an array.');
    const ids = new Set<string>();
    return Array.from(list, (annotation: PlotAnnotation, index) => {
        const id = annotation?.id;
        const reject = (reason: string): never => {
            throw new Error(`Plot annotation ${typeof id === 'string' && id.trim() ? `"${id}"` : `at index ${index}`}: ${reason}.`);
        };
        if (typeof id !== 'string' || !id.trim()) reject('expected a nonempty id');
        if (ids.has(id)) reject('duplicate id');
        ids.add(id);
        if (!axes) reject('this plot does not support annotations');
        if (Object.keys(annotation).some(key => !['id', 'type', 'x', 'y', 'label', 'color', 'series', 'fit'].includes(key))) reject('unsupported property');
        if (annotation.label !== undefined && typeof annotation.label !== 'string') reject('label must be a string');
        if (annotation.color !== undefined && typeof annotation.color !== 'string') reject('color must be a string');
        const { type, x, y } = annotation;
        if ('series' in annotation && annotation.series !== undefined) {
            if (type !== 'point' || typeof annotation.series !== 'string' || !annotation.series.trim()
                || typeof x !== 'string' || y !== undefined || ('fit' in annotation && annotation.fit !== undefined)) {
                reject('a series point requires a nonempty series key and a raw x key without y or fit');
            }
            if (!seriesPoint) reject('this plot does not support series-point lookup');
            return { ...annotation };
        }
        const sides = (['x', 'y'] as const).filter(side => annotation[side] !== undefined);
        if (type !== 'line' && type !== 'band' && type !== 'point') reject('expected a line, point, or band');
        if ('fit' in annotation && annotation.fit !== undefined) {
            if (type !== 'line' || annotation.fit !== 'linear' || sides.length !== 0) reject('expected fit: linear on a line without x or y');
            if (axes?.x?.kind !== 'numeric' || axes.y?.kind !== 'numeric'
                || !observations?.axes.includes('x') || !observations.axes.includes('y')) {
                reject('linear fit requires numeric x and y observations');
            }
            return { ...annotation };
        }
        if (sides.length !== (type === 'point' ? 2 : 1)) reject(type === 'point' ? 'expected both x and y' : 'expected exactly one of x and y');
        for (const side of sides) {
            const axis = axes?.[side] ?? reject(`unsupported ${side} axis`);
            const value = annotation[side];
            const values = type === 'band' ? Array.isArray(value) && value.length === 2 ? Array.from(value)
                : reject(`expected two ${side} endpoints`) : [value];
            if (axis.kind === 'numeric' && type !== 'band' && isStatistic(value)) {
                if (!observations?.axes.includes(side)) reject(`unsupported ${side} statistic: no numeric observations declared`);
                continue;
            }
            if (!values.every(v => axis.kind === 'numeric' ? typeof v === 'number' && Number.isFinite(v) : typeof v === 'string')) {
                reject(`${side} requires ${axis.kind === 'numeric' ? 'finite numbers' : 'category keys'}`);
            }
            if (type === 'band' && axis.kind === 'categorical' && !axis.bounds) reject(`unsupported ${side} band bounds`);
        }
        return { ...annotation, x: Array.isArray(x) ? [...x] : x, y: Array.isArray(y) ? [...y] : y } as PlotAnnotation;
    });
}

/** Paints only the dedicated reference layers, behind and in front of the data. */
export function paintAnnotations(list: readonly PlotAnnotation[], layout: AnnotationLayout, background: Layer, foreground: Layer, width: number, height: number): void {
    const { axes, seriesPoint, observations } = layout;
    const statistics = annotationStatistics(observations);
    const position = (side: 'x' | 'y', coordinate: AnnotationCoordinate | undefined) => {
        const axis = axes[side];
        const resolved = axis?.kind === 'numeric' && isStatistic(coordinate)
            ? observations?.axes.includes(side) ? statistics.coordinate(side, coordinate) : undefined
            : coordinate;
        return resolved !== undefined ? axis?.position(resolved) : undefined;
    };
    const within = (value: number | undefined, edge: number): value is number => value !== undefined && value >= 0 && value <= edge;
    for (const annotation of list) {
        const { id, type, label, x, y } = annotation;
        const target = type === 'point' && annotation.series !== undefined ? seriesPoint?.(annotation.series, annotation.x) : undefined;
        const color = annotation.color ?? target?.color ?? '#45566f';
        const labelAt = (left: number, top: number) => {
            if (!label) return;
            const text = foreground.append('text').attr('data-annotation-id', id)
                .attr('fill', color).attr('font-size', 11).text(label);
            text.attr('x', Math.max(0, Math.min(left + 4, width - (text.node()?.getComputedTextLength() ?? 0) - 2)))
                .attr('y', Math.max(12, Math.min(top + 13, height - 3)));
        };
        if (type === 'line' && annotation.fit === 'linear') {
            if (axes.x?.kind !== 'numeric' || axes.y?.kind !== 'numeric'
                || !observations?.axes.includes('x') || !observations.axes.includes('y')) continue;
            const fit = statistics.linearFit();
            if (!fit) continue;
            const pixels = [position('x', fit[0]), position('y', fit[1]), position('x', fit[2]), position('y', fit[3])];
            if (pixels.some(pixel => pixel === undefined || !Number.isFinite(pixel))) continue;
            const [x0, y0, x1, y1] = pixels as number[];
            // Intersect the segment with both pixel windows before positioning its label.
            let start = 0, end = 1;
            for (const [origin, delta, limit] of [[x0, x1 - x0, width], [y0, y1 - y0, height]]) {
                if (delta === 0) {
                    if (!within(origin, limit)) end = -1;
                } else {
                    const a = -origin / delta, b = (limit - origin) / delta;
                    start = Math.max(start, Math.min(a, b));
                    end = Math.min(end, Math.max(a, b));
                }
            }
            if (start >= end) continue;
            const fromX = x0 + (x1 - x0) * start, fromY = y0 + (y1 - y0) * start;
            foreground.append('g').attr('data-annotation-id', id).append('line')
                .attr('x1', fromX).attr('y1', fromY).attr('x2', x0 + (x1 - x0) * end).attr('y2', y0 + (y1 - y0) * end)
                .attr('stroke', color).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
            labelAt(fromX, fromY);
            continue;
        }
        if (type === 'point') {
            if (annotation.series !== undefined && !target) continue;
            const paired = x === 'mean' && y === 'mean' && axes.x?.kind === 'numeric' && axes.y?.kind === 'numeric';
            const centroid = paired && observations?.axes.includes('x') && observations.axes.includes('y') ? statistics.centroid() : undefined;
            if (paired && !centroid) continue;
            const px = target?.x ?? position('x', centroid?.x ?? x);
            const py = target?.y ?? position('y', centroid?.y ?? y);
            if (!within(px, width) || !within(py, height)) continue;
            foreground.append('g').attr('data-annotation-id', id).append('circle')
                .attr('cx', px).attr('cy', py).attr('r', 5).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2);
            labelAt(px + 4, py);
            continue;
        }
        const vertical = x !== undefined;
        const axis = vertical ? axes.x : axes.y;
        const extent = vertical ? width : height;
        if (type === 'line') {
            const pixel = position(vertical ? 'x' : 'y', x ?? y);
            if (!within(pixel, extent)) continue;
            foreground.append('g').attr('data-annotation-id', id).append('line')
                .attr('x1', vertical ? pixel : 0).attr('x2', vertical ? pixel : width)
                .attr('y1', vertical ? 0 : pixel).attr('y2', vertical ? height : pixel)
                .attr('stroke', color).attr('stroke-width', 1.5).attr('stroke-dasharray', '4 3');
            labelAt(vertical ? pixel : 0, vertical ? 0 : pixel);
            continue;
        }
        if (type !== 'band') continue;
        const endpoints = (x ?? y)!;
        const pixels = axis?.kind === 'categorical'
            ? endpoints.map(key => axis.bounds?.(String(key))) : endpoints.map(value => [axis?.position(value)]);
        if (pixels.some(bounds => !bounds?.every(Number.isFinite))) continue;
        const range = pixels.flat() as number[];
        const start = Math.max(0, Math.min(...range));
        const end = Math.min(extent, Math.max(...range));
        if (start >= end) continue;
        background.append('g').attr('data-annotation-id', id).append('rect')
            .attr('x', vertical ? start : 0).attr('y', vertical ? 0 : start)
            .attr('width', vertical ? end - start : width).attr('height', vertical ? height : end - start)
            .attr('fill', color).attr('fill-opacity', 0.16);
        labelAt(vertical ? start : 0, vertical ? 0 : start);
    }
}
