/**
 * Scenarios of the Autark use cases that already use autk-plot, so the
 * replacement keeps them working. Niteroi sets its own highlight color and
 * draws a line chart from an empty collection, filled when roads are brushed.
 */

import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import { afterEach, describe, expect, test } from 'vitest';

import * as next from '../src';
import type { UnifiedPlotConfig } from '../src';

/** Colors as the package starts, restored after each test (they are process-wide). */
const DEFAULTS = { _highlight: '#5dade2', _provenance: '#63d8c0', _provenanceStroke: '#2fae95', _provenanceText: '#073b2c' };
afterEach(() => {
    Object.assign(next.PlotStyle as unknown as Record<string, string>, DEFAULTS);
    document.body.innerHTML = '';
});

/** Roads with an intercept, an angle and a yearly series, as Niteroi computes them. */
function roads(count: number): FeatureCollection<Geometry, GeoJsonProperties> {
    return {
        type: 'FeatureCollection',
        features: Array.from({ length: count }, (_, i) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [i, i] },
            properties: {
                compute: { intercept: 30 + i, angle: (i % 5) / 10 },
                lst_timeseries: [2001, 2002, 2003].map((year, k) => ({ timestamp: String(year), value: 30 + i + k })),
            },
        })),
    };
}

function host(): HTMLElement {
    const div = document.createElement('div');
    document.body.append(div);
    return div;
}

describe('Niteroi', () => {
    test('PlotStyle.setHighlightColor colors the selection, as before', () => {
        next.PlotStyle.setHighlightColor('#1a7a2e');
        const div = host();
        const plot = new next.AutkPlot(div, {
            type: 'scatterplot', collection: roads(6),
            attributes: { axis: ['compute.intercept', 'compute.angle'] },
            width: 600, height: 380, events: [next.PlotEvent.BRUSH],
        } as UnifiedPlotConfig);

        plot.setSelection([0, 2]);

        const fills = Array.from(div.querySelectorAll<SVGElement>('.autkMark')).map(mark => mark.style.fill);
        const selected = fills.filter(fill => fill === 'rgb(26, 122, 46)' || fill === '#1a7a2e');
        expect(selected).toHaveLength(2);
        expect(next.PlotStyle.provenance).toBe('#1a7a2e');
    });

    test('the outline and the text over a new selection color follow it', () => {
        next.PlotStyle.setProvenanceColor('#1a7a2e');
        expect(next.PlotStyle.provenanceStroke).not.toBe(DEFAULTS._provenanceStroke);
        // A dark green reads white text; a light one reads a darker shade.
        expect(next.PlotStyle.provenanceText).toBe('#ffffff');
        next.PlotStyle.setProvenanceColor('#c8f5e9');
        expect(next.PlotStyle.provenanceText).not.toBe('#ffffff');
    });

    test('a line chart built from an empty collection draws once roads are selected', () => {
        const div = host();
        const all = roads(4);
        const plot = new next.AutkPlot(div, {
            type: 'linechart', collection: { type: 'FeatureCollection', features: [] },
            attributes: { axis: ['lst_timeseries', '@transform'] },
            transform: { preset: 'reduce-series', options: { timestamp: 'timestamp', value: 'value' } },
            tickFormats: ['.0f', '.1f'], width: 600, height: 280,
        } as UnifiedPlotConfig);
        expect(div.querySelectorAll('.autkMark')).toHaveLength(0);

        plot.updateCollection({ ...all, features: [all.features[1], all.features[3]] });

        // One point per year, averaged over the two roads.
        expect(div.querySelectorAll('.autkMark')).toHaveLength(3);
        plot.updateCollection({ ...all, features: [] });
        expect(div.querySelectorAll('.autkMark')).toHaveLength(0);
    });
});
