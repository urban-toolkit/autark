// @vitest-environment happy-dom
import type { Feature, FeatureCollection } from 'geojson';
import { afterEach, describe, expect, it } from 'vitest';

import { AutkPlot } from '../src';

// Three features with coordinates for the scatterplot.
const collection: FeatureCollection = {
    type: 'FeatureCollection',
    features: [0, 1, 2].map((i): Feature => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [i, i] },
        properties: { x: i, y: 2 * i },
    })),
};

function host(): HTMLElement {
    const div = document.createElement('div');
    document.body.appendChild(div);
    return div;
}

/** The radius of each mark of the plot drawn in `div`, in the order of its marks. */
function radii(div: HTMLElement): (string | null)[] {
    return Array.from(div.querySelectorAll<SVGElement>('.autkMark'), (mark) => mark.getAttribute('r'));
}

afterEach(() => {
    document.body.replaceChildren();
});

describe('markRadius', () => {
    it('draws scatterplot marks with a radius of 5 when it is omitted', () => {
        const div = host();
        new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] } });

        expect(radii(div)).toEqual(['5', '5', '5']);
    });

    it('draws scatterplot marks with the radius it gives', () => {
        const div = host();
        new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] }, markRadius: 2.5 });

        expect(radii(div)).toEqual(['2.5', '2.5', '2.5']);
    });

    it('keeps the radius through a redraw', () => {
        const div = host();
        const plot = new AutkPlot(div, { type: 'scatterplot', collection, attributes: { axis: ['x', 'y'] }, markRadius: 8 });
        plot.draw();

        expect(radii(div)).toEqual(['8', '8', '8']);
    });
});
