import { max, mean, min, sum } from 'd3';

/** Numeric coordinates from the same observation. Omit missing or invalid coordinates. */
export type PlotAnnotationObservation = { x?: number; y?: number };

/** Declares statistical support independently of the axes' display mappings. */
export type PlotAnnotationObservations = {
    axes: readonly ('x' | 'y')[];
    rows: readonly PlotAnnotationObservation[];
};

export type AnnotationStatistic = 'min' | 'max' | 'mean';

/** Resolves marginal statistics and paired statistics independently, on demand. */
export function annotationStatistics(observations: PlotAnnotationObservations | undefined) {
    const reducers: Record<AnnotationStatistic, (
        rows: readonly PlotAnnotationObservation[], read: (row: PlotAnnotationObservation) => number | undefined,
    ) => number | undefined> = { min, max, mean };
    const rows = observations?.rows ?? [];
    const cache = new Map<string, number | undefined>();
    const finite = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value);
    let pairs: Required<PlotAnnotationObservation>[] | undefined;
    let center: { x: number; y: number } | undefined;
    let fit: [number, number, number, number] | null | undefined;
    return {
        coordinate(side: 'x' | 'y', statistic: AnnotationStatistic) {
            const key = `${side}:${statistic}`;
            if (!cache.has(key)) cache.set(key, reducers[statistic](rows, row => finite(row[side]) ? row[side] : undefined));
            return cache.get(key);
        },
        centroid() {
            pairs ??= rows.filter((row): row is Required<PlotAnnotationObservation> => finite(row.x) && finite(row.y));
            if (pairs.length > 0) center ??= { x: mean(pairs, row => row.x)!, y: mean(pairs, row => row.y)! };
            return center;
        },
        linearFit() {
            if (fit !== undefined) return fit;
            fit = null;
            const centroid = this.centroid();
            if (!centroid || !pairs || pairs.length < 2) return fit;
            const start = min(pairs, row => row.x)!;
            const end = max(pairs, row => row.x)!;
            if (start === end) return fit;
            const variance = sum(pairs, ({ x }) => (x - centroid.x) ** 2);
            const covariance = sum(pairs, ({ x, y }) => (x - centroid.x) * (y - centroid.y));
            const slope = covariance / variance;
            const at = (x: number) => centroid.y + slope * (x - centroid.x);
            const segment: [number, number, number, number] = [start, at(start), end, at(end)];
            if (segment.every(Number.isFinite)) fit = segment;
            return fit;
        },
    };
}
