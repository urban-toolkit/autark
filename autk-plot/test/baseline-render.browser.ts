/**
 * Baseline equivalence: interaction.
 *
 * Builds each gallery plot configuration, replays the same interaction script
 * as the original autk-plot 4.1.1, and requires, after every step, the marks,
 * the selection and the selections in the emitted events recorded from it
 * (baselines/interactions.json). The rendering itself differs on purpose:
 * selections are drawn with the provenance view, and aggregated plots add
 * `shares` to their events.
 *
 * One difference is accepted on purpose: a histogram keeps its empty ranges,
 * so it draws one mark more for each range with no region, where the original
 * skipped it. Selections and events stay the recorded ones.
 */

import { beforeAll, describe, expect, test } from 'vitest';

import * as autkPlot from '../src';

import { RENDER_CASES, replay } from './baseline-cases';
import type { Snapshot } from './baseline-cases';
import baseline from './baselines/interactions.json';
import { installSvgBBox } from './svg-geometry';

const recorded = baseline as unknown as Record<string, Snapshot[]>;

/** Ranges with no region in the numeric histograms of the gallery, which the original did not draw. */
const EMPTY_RANGES: Record<string, number> = { 'histogram-brush': 1, 'histogram-rebuild (click)': 1 };

/** The recording, with the marks of the empty ranges added. */
const accepted = (name: string, snapshots: Snapshot[]): Snapshot[] =>
    snapshots.map(snapshot => ({ ...snapshot, marks: snapshot.marks + (EMPTY_RANGES[name] ?? 0) }));

beforeAll(() => installSvgBBox());

describe('autk-plot interacts like the original autk-plot 4.1.1', () => {
    test.each(RENDER_CASES)('$name', (testCase) => {
        const expected = recorded[testCase.name];

        // Guards against a vacuous comparison: local interactions must reach the
        // marks and the script must produce a non-empty selection at some point.
        testCase.steps.forEach((step, index) => {
            if (step.kind !== 'set-selection') expect(expected[index + 1].emitted.length, JSON.stringify(step)).toBeGreaterThan(0);
        });
        expect(expected.some(snapshot => snapshot.selection.length > 0)).toBe(true);
        expect(expected[0].marks).toBeGreaterThan(0);

        expect(replay(autkPlot, testCase)).toEqual(accepted(testCase.name, expected));
    });
});
