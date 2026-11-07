import { ownMatrix, parseSector } from '../src';

/**
 * Minimal `getBBox` for jsdom, which does not implement SVG layout.
 *
 * Brush hit-testing in `PlotBaseInteractive.nodeIntersectsRect()` reads the
 * local bounding box of `rect` and `circle` marks. Boxes are derived from the
 * geometry attributes, which is what a browser returns for untransformed
 * shapes in their own user space. Any other element fails loudly instead of
 * returning a guessed box.
 *
 * jsdom also lacks `getTotalLength`, so partially overlapping marks are
 * accepted after the bounding-box test, whereas a browser samples their
 * outline. Both packages run under the same behavior, which keeps the
 * equivalence comparison valid, but it is not a browser-exact hit test.
 */
export function installSvgBBox(): void {
    if ('getBBox' in SVGElement.prototype) return;

    const number = (element: Element, name: string): number => Number(element.getAttribute(name) ?? 0) || 0;

    Object.defineProperty(SVGElement.prototype, 'getBBox', {
        configurable: true,
        value(this: SVGElement): DOMRect {
            const tag = this.tagName.toLowerCase();
            if (tag === 'rect') {
                return new DOMRect(number(this, 'x'), number(this, 'y'), number(this, 'width'), number(this, 'height'));
            }
            if (tag === 'circle') {
                const r = number(this, 'r');
                return new DOMRect(number(this, 'cx') - r, number(this, 'cy') - r, 2 * r, 2 * r);
            }
            throw new Error(`getBBox polyfill does not support <${tag}>.`);
        },
    });
}

/** Box of a mark in its parent's coordinates. */
export type EffectiveBox = { x: number; y: number; width: number; height: number };

/** Vertices of a path made only of absolute `M` and `L` commands (a polygon), or `null`. */
function polygonOf(d: string | null): [number, number][] | null {
    if (!d || !/^\s*M[\d\s,.eE+-]*(L[\d\s,.eE+-]*)*Z?\s*$/.test(d)) return null;
    const numbers = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    const points: [number, number][] = [];
    for (let i = 0; i + 1 < numbers.length; i += 2) points.push([numbers[i], numbers[i + 1]]);
    return points.length > 0 ? points : null;
}

/**
 * Box of a `rect`, `circle`, or polygonal `path` through its own `transform`
 * (translate and scale), in its parent's coordinates: what is drawn, whether
 * the geometry is in the attributes or in a transform (a partial mark may be a
 * scaled copy of its mark).
 *
 * @returns The box, or `null` for a missing element or another shape.
 */
export function effectiveBox(element: Element | null | undefined): EffectiveBox | null {
    if (!element) return null;
    const number = (name: string): number => Number(element.getAttribute(name) ?? 0) || 0;
    const tag = element.tagName.toLowerCase();
    let corners: [number, number, number, number];
    const polygon = tag === 'path' ? polygonOf(element.getAttribute('d')) : null;
    if (tag === 'rect') corners = [number('x'), number('y'), number('x') + number('width'), number('y') + number('height')];
    else if (tag === 'circle') corners = [number('cx') - number('r'), number('cy') - number('r'), number('cx') + number('r'), number('cy') + number('r')];
    else if (polygon) {
        const xs = polygon.map(p => p[0]);
        const ys = polygon.map(p => p[1]);
        corners = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    } else return null;
    const [a, , , d, e, f] = ownMatrix(element);
    const [x0, x1] = [a * corners[0] + e, a * corners[2] + e].sort((p, q) => p - q);
    const [y0, y1] = [d * corners[1] + f, d * corners[3] + f].sort((p, q) => p - q);
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Sector drawn by an element: its radii and angles. */
export type EffectiveSector = { inner: number; outer: number; start: number; sweep: number };

/**
 * Sector drawn by an arc `path`, as seen: the outer radius is cut by a circular
 * `clip-path` centered on the arc (a partial slice may be a clipped copy).
 *
 * @returns The sector, or `null` when the element is not an arc path.
 */
export function effectiveSector(element: Element | null | undefined): EffectiveSector | null {
    if (!element || element.tagName.toLowerCase() !== 'path') return null;
    const sector = parseSector(element.getAttribute('d'));
    if (!sector) return null;
    let outer = sector.outer;
    const clip = /url\(#([^)]+)\)/.exec(element.getAttribute('clip-path') ?? '')?.[1];
    // Looked up in the element's own SVG, which may be outside the document.
    const circle = clip ? element.closest('svg')?.querySelector(`[id="${clip}"] circle`) : null;
    if (circle) outer = Math.min(outer, Number(circle.getAttribute('r')));
    return { inner: sector.inner, outer, start: sector.start, sweep: sector.sweep };
}
