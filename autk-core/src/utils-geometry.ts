/**
 * @module GeometryUtils
 * Planar geometry helpers used by triangulation code.
 * This module provides utilities for expanding local-space polylines into
 * closed polygons, normalizing rings, computing signed ring areas, and
 * deriving convex hulls from 2D point sets.
 */

/**
 * Builds a closed polygon that represents a planar offset of a polyline.
 *
 * Input coordinates are expected to already be in a local planar system
 * (for example, shifted projected meters). The returned polygon is suitable
 * for triangulation with earcut.
 *
 * @param points - Ordered local-space polyline coordinates.
 * Consecutive duplicate points are ignored before the offset is computed.
 * @param distance - Offset distance applied on both sides of the polyline.
 * A value of `0` returns an empty polygon.
 * @returns A closed polygon describing the buffered polyline footprint in
 * local planar coordinates. Returns an empty array when the input does not
 * contain at least two distinct points.
 */
export function offsetPolyline(points: number[][], distance: number): [number, number][] {
    const clean = points.filter((point, index) => {
        if (index === 0) return true;
        const prev = points[index - 1];
        return point[0] !== prev[0] || point[1] !== prev[1];
    }) as [number, number][];

    if (clean.length < 2 || distance === 0) {
        return [];
    }

    const left: [number, number][] = [];
    const right: [number, number][] = [];

    for (let i = 0; i < clean.length; i++) {
        const prev = i > 0 ? clean[i - 1] : null;
        const curr = clean[i];
        const next = i < clean.length - 1 ? clean[i + 1] : null;

        const prevNormal = prev ? getUnitLeftNormal(prev, curr) : null;
        const nextNormal = next ? getUnitLeftNormal(curr, next) : null;

        const leftPoint = computeOffsetPoint(prev, curr, next, prevNormal, nextNormal, distance, 1);
        const rightPoint = computeOffsetPoint(prev, curr, next, prevNormal, nextNormal, distance, -1);

        left.push(leftPoint);
        right.push(rightPoint);
    }

    const polygon = [...left, ...right.reverse()];
    if (polygon.length > 0) {
        polygon.push([polygon[0][0], polygon[0][1]]);
    }

    return polygon;
}

/**
 * Removes a duplicated closing vertex from a ring when present.
 *
 * @param ring - Polygon ring to normalize.
 * @returns A shallow copy of the ring without a repeated closing point.
 */
export function normalizeRing(ring: number[][]): number[][] {
    if (ring.length < 2) return [...ring];
    const normalized = [...ring];
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
        normalized.pop();
    }
    return normalized;
}

/**
 * Computes a convex hull from an arbitrary set of 2D points.
 *
 * Uses the monotonic chain algorithm after removing duplicate points.
 *
 * @param points - Input points to reduce to a convex hull.
 * @returns Hull points ordered around the outer boundary.
 */
export function computePointConvexHull(points: number[][]): number[][] {
    const unique = Array.from(new Map(
        normalizeRing(points).map((point) => [`${point[0]},${point[1]}`, point as [number, number]])
    ).values());

    if (unique.length <= 3) {
        return unique.map(([x, y]) => [x, y]);
    }

    unique.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

    const lower: Array<[number, number]> = [];
    for (const point of unique) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    }

    const upper: Array<[number, number]> = [];
    for (let i = unique.length - 1; i >= 0; i--) {
        const point = unique[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    }

    lower.pop();
    upper.pop();
    return [...lower, ...upper].map(([x, y]) => [x, y]);
}

/**
 * Computes the signed planar area of a polygon ring.
 *
 * @param ring - Ring vertices in order around the polygon.
 * @returns Signed area of the ring. Counterclockwise rings produce positive
 * area and clockwise rings produce negative area.
 */
export function computeRingArea(ring: number[][]): number {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % ring.length];
        area += x1 * y2 - x2 * y1;
    }
    return area * 0.5;
}

/**
 * Computes the total perimeter length of a polygon ring.
 *
 * @param ring - Ring vertices in order around the polygon.
 * @returns Sum of Euclidean edge lengths around the ring.
 */
export function polygonPerimeter(ring: number[][]): number {
    let perimeter = 0;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const dx = ring[i][0] - ring[j][0];
        const dy = ring[i][1] - ring[j][1];
        perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
}

/**
 * Returns true when a polygon ring is convex.
 *
 * Assumes the ring is already open, with no duplicated closing vertex.
 * Collinear vertices are ignored when testing turn direction consistency.
 *
 * @param ring - Open polygon ring to test.
 * @returns `true` when all non-zero cross products share the same sign,
 * otherwise `false`.
 */
export function isConvex(ring: number[][]): boolean {
    const n = ring.length;
    let sign = 0;
    for (let i = 0; i < n; i++) {
        const prev = (i + n - 1) % n;
        const next = (i + 1) % n;
        const e1x = ring[i][0] - ring[prev][0];
        const e1y = ring[i][1] - ring[prev][1];
        const e2x = ring[next][0] - ring[i][0];
        const e2y = ring[next][1] - ring[i][1];
        const turn = e1x * e2y - e1y * e2x;
        if (Math.abs(turn) < 1e-10) continue;
        const currentSign = turn > 0 ? 1 : -1;
        if (sign === 0) sign = currentSign;
        else if (currentSign !== sign) return false;
    }
    return true;
}

/**
 * Computes the unit left-hand normal for the directed segment from `a` to `b`.
 *
 * @param a - Start point of the segment.
 * @param b - End point of the segment.
 * @returns A normalized left-hand perpendicular vector, or `null` when the
 * segment has zero length.
 */
function getUnitLeftNormal(a: [number, number], b: [number, number]): [number, number] | null {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);

    if (length === 0) {
        return null;
    }

    return [-dy / length, dx / length];
}

/**
 * Computes the offset vertex for one side of a polyline at the current point.
 *
 * Uses the previous and next segment normals to construct either a joined
 * offset corner or a fallback averaged direction when the offset segments do
 * not intersect cleanly.
 *
 * @param prev - Previous polyline point, or `null` when `curr` is the first point.
 * @param curr - Current polyline point being offset.
 * @param next - Next polyline point, or `null` when `curr` is the last point.
 * @param prevNormal - Unit left normal of the incoming segment, if available.
 * @param nextNormal - Unit left normal of the outgoing segment, if available.
 * @param distance - Offset distance applied away from the source polyline.
 * @param side - Offset side multiplier: `1` for the left outline, `-1` for the right outline.
 * @returns The offset point for the requested side at `curr`.
 */
function computeOffsetPoint(
    prev: [number, number] | null,
    curr: [number, number],
    next: [number, number] | null,
    prevNormal: [number, number] | null,
    nextNormal: [number, number] | null,
    distance: number,
    side: 1 | -1,
): [number, number] {
    if (!prevNormal && !nextNormal) {
        return curr;
    }

    if (!prev || !prevNormal) {
        return [
            curr[0] + nextNormal![0] * distance * side,
            curr[1] + nextNormal![1] * distance * side,
        ];
    }

    if (!next || !nextNormal) {
        return [
            curr[0] + prevNormal[0] * distance * side,
            curr[1] + prevNormal[1] * distance * side,
        ];
    }

    const prevOffsetA: [number, number] = [
        prev[0] + prevNormal[0] * distance * side,
        prev[1] + prevNormal[1] * distance * side,
    ];
    const prevOffsetB: [number, number] = [
        curr[0] + prevNormal[0] * distance * side,
        curr[1] + prevNormal[1] * distance * side,
    ];
    const nextOffsetA: [number, number] = [
        curr[0] + nextNormal[0] * distance * side,
        curr[1] + nextNormal[1] * distance * side,
    ];
    const nextOffsetB: [number, number] = [
        next[0] + nextNormal[0] * distance * side,
        next[1] + nextNormal[1] * distance * side,
    ];

    const intersection = intersectLines(prevOffsetA, prevOffsetB, nextOffsetA, nextOffsetB);
    if (intersection) {
        return intersection;
    }

    const avgX = prevNormal[0] + nextNormal[0];
    const avgY = prevNormal[1] + nextNormal[1];
    const avgLength = Math.hypot(avgX, avgY);

    if (avgLength === 0) {
        return [
            curr[0] + nextNormal[0] * distance * side,
            curr[1] + nextNormal[1] * distance * side,
        ];
    }

    return [
        curr[0] + (avgX / avgLength) * distance * side,
        curr[1] + (avgY / avgLength) * distance * side,
    ];
}

/**
 * Computes the intersection point of two infinite 2D lines.
 *
 * The lines are defined by the point pairs `a1`-`a2` and `b1`-`b2`.
 * Parallel or nearly parallel lines return `null`.
 *
 * @param a1 - First point on the first line.
 * @param a2 - Second point on the first line.
 * @param b1 - First point on the second line.
 * @param b2 - Second point on the second line.
 * @returns The line intersection point, or `null` when the lines are parallel.
 */
function intersectLines(
    a1: [number, number],
    a2: [number, number],
    b1: [number, number],
    b2: [number, number],
): [number, number] | null {
    const x1 = a1[0];
    const y1 = a1[1];
    const x2 = a2[0];
    const y2 = a2[1];
    const x3 = b1[0];
    const y3 = b1[1];
    const x4 = b2[0];
    const y4 = b2[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-9) {
        return null;
    }

    const detA = x1 * y2 - y1 * x2;
    const detB = x3 * y4 - y3 * x4;

    return [
        (detA * (x3 - x4) - (x1 - x2) * detB) / denom,
        (detA * (y3 - y4) - (y1 - y2) * detB) / denom,
    ];
}

/**
 * Computes the signed cross product of the turn from `a` -> `b` -> `c`.
 *
 * @param a - First point.
 * @param b - Second point.
 * @param c - Third point.
 * @returns Positive for counterclockwise turns, negative for clockwise
 * turns, and `0` for collinear points.
 */
function cross(a: [number, number], b: [number, number], c: [number, number]): number {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
