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
