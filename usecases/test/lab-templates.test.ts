/**
 * The built-in templates of the provenance use case are the code autk-plot registers.
 *
 * `src/provenance/lab-builtin-templates.ts` is generated from `autk-plot/src/plots` and
 * `autk-plot/src/transforms/presets` by `scripts/lab-templates.mjs`. This test fails when it is out
 * of date. That each template draws what its built-in chart draws, and that each transform
 * template gives the built-in output, is checked in Chrome
 * (`autk-plot/test/lab-templates.browser.ts`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { templatesModule } from '../scripts/lab-templates.mjs';

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

describe('Try it Yourself built-in templates', () => {
    it('are generated from the current package sources (run node usecases/scripts/lab-templates.mjs)', () => {
        const file = readFileSync(path('../src/provenance/lab-builtin-templates.ts'), 'utf8');
        expect(file.replace(/\r\n/g, '\n')).toBe(templatesModule(path('../../autk-plot/src')));
    });
});
