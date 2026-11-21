/**
 * @fileoverview Axis titles placed clear of their tick labels, as drawn.
 *
 * The bar chart, scatterplot, line chart and heat matrix draw an x title under
 * their x axis and a rotated y title left of their y axis, each inside its axis
 * group. Tick labels can be long or rotated, so a title at a fixed offset can run
 * over them: these helpers measure the labels as drawn and move the title clear.
 */

import type { PlotMargins } from './api';

/** Space kept between a title and its axis's tick labels, in pixels: d3's tick padding. */
const TITLE_GAP = 3;

/** A box in an axis group's coordinates. */
type Box = { left: number; top: number; right: number; bottom: number };

/** An affine transform as SVG writes it: x' = a x + c y + e, y' = b x + d y + f. */
type Matrix = [number, number, number, number, number, number];

/** How far each title, once moved clear of its tick labels, runs past its margin, in pixels. */
export type TitleOverflow = { bottom: number; left: number };

/**
 * Places the x and y titles of a plot clear of their tick labels, as drawn. A
 * title drawn over any of its axis's tick labels moves, the x title below the
 * lowest point of the x tick labels and the y title beyond the widest y tick
 * label, `TITLE_GAP` pixels away. A title drawn over none keeps its place. Where
 * nothing is laid out (a plot drawn hidden), nothing is measured and the titles
 * stay where they are.
 *
 * @param svg - The plot's svg, if it has one.
 * @param margins - The margins the plot was drawn with.
 * @returns How far each moved title runs past its margin (0 or less when it fits).
 */
export function placeAxisTitles(svg: SVGSVGElement | null, margins: PlotMargins): TitleOverflow {
    const overflow: TitleOverflow = { bottom: 0, left: 0 };

    const xAxis = svg?.querySelector<SVGGElement>('.x.axis');
    const xTitle = xAxis ? titleOf(xAxis) : null;
    if (xAxis && xTitle) {
        const labels = labelBoxes(xAxis);
        const title = boxIn(xAxis, xTitle);
        if (title && labels.some(label => overlaps(label, title))) {
            const shift = Math.max(...labels.map(label => label.bottom)) + TITLE_GAP - title.top;
            moveBy(xAxis, xTitle, 0, shift);
            overflow.bottom = title.bottom + shift - margins.bottom;
        }
    }

    const yAxis = svg?.querySelector<SVGGElement>('.y.axis');
    const yTitle = yAxis ? titleOf(yAxis) : null;
    if (yAxis && yTitle) {
        const labels = labelBoxes(yAxis);
        const title = boxIn(yAxis, yTitle);
        if (title && labels.some(label => overlaps(label, title))) {
            const shift = Math.min(...labels.map(label => label.left)) - TITLE_GAP - title.right;
            moveBy(yAxis, yTitle, shift, 0);
            overflow.left = -margins.left - (title.left + shift);
        }
    }

    return overflow;
}

/**
 * Tells whether two boxes overlap.
 *
 * @param a - A box.
 * @param b - Another box in the same coordinates.
 * @returns True if they share more than an edge.
 */
function overlaps(a: Box, b: Box): boolean {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Returns the title of an axis group: its child of class `axis-label`.
 *
 * @param axis - Axis group.
 * @returns The title, or null if the axis has none.
 */
function titleOf(axis: SVGGElement): SVGGraphicsElement | null {
    const title = Array.from(axis.children).find(child => child.classList.contains('axis-label'));
    return (title as SVGGraphicsElement | undefined) ?? null;
}

/**
 * Returns the box of each tick label of an axis group, in its coordinates.
 *
 * @param axis - Axis group.
 * @returns The boxes of the labels that could be measured.
 */
function labelBoxes(axis: SVGGElement): Box[] {
    const boxes: Box[] = [];
    for (const label of Array.from(axis.querySelectorAll<SVGGraphicsElement>('.tick text'))) {
        const box = boxIn(axis, label);
        if (box) boxes.push(box);
    }
    return boxes;
}

/**
 * Returns the box an element's drawing takes in the coordinates of its ancestor
 * `frame`: its own box, carried through its own transform and those between them.
 *
 * @param frame - An ancestor of the element.
 * @param element - The element to measure.
 * @returns The box, or null if the element has no drawing to measure.
 */
function boxIn(frame: Element, element: SVGGraphicsElement): Box | null {
    let own: DOMRect;
    try {
        own = element.getBBox();
    } catch {
        // Some browsers throw for an element that is not rendered.
        return null;
    }
    if (!own || (own.width === 0 && own.height === 0)) return null;

    const [a, b, c, d, e, f] = matrixIn(frame, element);
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [x, y] of [[own.x, own.y], [own.x + own.width, own.y], [own.x, own.y + own.height], [own.x + own.width, own.y + own.height]]) {
        xs.push(a * x + c * y + e);
        ys.push(b * x + d * y + f);
    }
    return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/**
 * Moves an element by a shift given in the coordinates of its ancestor `frame`,
 * through its `x` and `y` attributes.
 *
 * @param frame - An ancestor of the element.
 * @param element - The element to move.
 * @param dx - Horizontal shift in the frame's coordinates.
 * @param dy - Vertical shift in the frame's coordinates.
 */
function moveBy(frame: Element, element: SVGGraphicsElement, dx: number, dy: number): void {
    // The shift in the element's own coordinates, through the inverse of the transform's linear part.
    const [a, b, c, d] = matrixIn(frame, element);
    const det = a * d - b * c;
    if (det === 0) return;
    const ownX = (d * dx - c * dy) / det;
    const ownY = (a * dy - b * dx) / det;
    for (const [name, delta] of [['x', ownX], ['y', ownY]] as const) {
        if (Math.abs(delta) < 1e-9) continue;
        const value = (Number(element.getAttribute(name)) || 0) + delta;
        element.setAttribute(name, String(Math.round(value * 100) / 100));
    }
}

/**
 * Returns the transform from an element's coordinates to those of its ancestor `frame`.
 *
 * @param frame - An ancestor of the element.
 * @param element - The element.
 * @returns The transform as `[a, b, c, d, e, f]`.
 */
function matrixIn(frame: Element, element: Element): Matrix {
    let matrix: Matrix = [1, 0, 0, 1, 0, 0];
    for (let node: Element | null = element; node && node !== frame; node = node.parentElement) {
        const list = (node as SVGGraphicsElement).transform?.baseVal;
        let own: Matrix = [1, 0, 0, 1, 0, 0];
        for (let i = 0; i < (list?.numberOfItems ?? 0); i++) {
            const { a, b, c, d, e, f } = list!.getItem(i).matrix;
            own = compose(own, [a, b, c, d, e, f]);
        }
        matrix = compose(own, matrix);
    }
    return matrix;
}

/**
 * Composes two transforms.
 *
 * @param outer - Transform applied second.
 * @param inner - Transform applied first.
 * @returns `outer` after `inner`.
 */
function compose(outer: Matrix, inner: Matrix): Matrix {
    const [a, b, c, d, e, f] = outer;
    const [a2, b2, c2, d2, e2, f2] = inner;
    return [
        a * a2 + c * b2,
        b * a2 + d * b2,
        a * c2 + c * d2,
        b * c2 + d * d2,
        a * e2 + c * f2 + e,
        b * e2 + d * f2 + f,
    ];
}
