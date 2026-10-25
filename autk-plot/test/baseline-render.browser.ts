/**
 * Baseline equivalence: interaction.
 *
 * Builds each gallery plot configuration, replays the same interaction script
 * as the original autk-plot 4.1.1, and requires, after every step, the marks,
 * the selection and the selections in the emitted events recorded from it
 * (baselines/interactions.json). The rendering itself differs on purpose:
 * selections are drawn with the provenance view, and aggregated plots add
 * `shares` to their events.
 */

import { describe, expect, test } from 'vitest';

import * as next from '../src';

import { RENDER_CASES, replay } from './baseline-cases';
import type { Snapshot } from './baseline-cases';
import baseline from './baselines/interactions.json';

const recorded = baseline as unknown as Record<string, Snapshot[]>;

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

        expect(replay(next, testCase)).toEqual(expected);
    });
});
