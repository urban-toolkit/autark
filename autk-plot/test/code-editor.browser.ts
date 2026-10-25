/**
 * Colored code of Try it Yourself: the highlighted copy keeps the text
 * exactly (so it lines up with the text area), marks the `// Autark` lines,
 * and colors Autark names, also inside strings.
 */

import { describe, expect, test } from 'vitest';

import { attachHighlighter, highlightCode } from '../../usecases/src/provenance/code-editor';
import { PLOT_LAB_TEMPLATES } from '../../usecases/src/provenance/lab-plot-templates';
import { LAB_TEMPLATES } from '../../usecases/src/provenance/lab-transform-templates';

/** Text of highlighted HTML, as the browser shows it. */
function textOf(html: string): string[] {
    const host = document.createElement('div');
    host.innerHTML = html;
    return Array.from(host.querySelectorAll('.code-line')).map(line => line.textContent ?? '');
}

describe('highlightCode', () => {
    test('keeps every template character, one block per line', () => {
        for (const { code } of [...PLOT_LAB_TEMPLATES, ...LAB_TEMPLATES]) {
            expect(textOf(highlightCode(code))).toEqual(code.split('\n'));
        }
    });

    test('escapes markup typed in the code', () => {
        const html = highlightCode('const a = "<b>" < 2 && b > 1;');
        expect(html).not.toContain('<b>');
        expect(textOf(html)).toEqual(['const a = "<b>" < 2 && b > 1;']);
    });

    test('marks the lines that differ from plain D3', () => {
        const host = document.createElement('div');
        host.innerHTML = highlightCode('const data = rows; // Autark: instead of d3.csv(...)\nconst x = 1;\n// The lines marked "// Autark" are the only differences');
        const lines = Array.from(host.querySelectorAll('.code-line'));
        // The third line only quotes the marker in its comment.
        expect(lines.map(line => line.classList.contains('autark'))).toEqual([true, false, false]);
    });

    test('colors Autark names in code and in strings', () => {
        const host = document.createElement('div');
        host.innerHTML = highlightCode(".attr('class', 'autkMark'); lib.collectBuckets({});");
        expect(Array.from(host.querySelectorAll('.tok-autark')).map(t => t.textContent)).toEqual(['autkMark', 'lib.collectBuckets']);
    });

    test('a block comment spans lines', () => {
        const host = document.createElement('div');
        host.innerHTML = highlightCode('/* one\ntwo */ const a = 1;');
        expect(Array.from(host.querySelectorAll('.tok-comment')).map(t => t.textContent)).toEqual(['/* one', 'two */']);
        expect(host.querySelector('.tok-keyword')?.textContent).toBe('const');
    });
});

describe('attachHighlighter', () => {
    test('draws the colors behind the text area and redraws while typing', () => {
        const textarea = document.createElement('textarea');
        document.body.append(textarea);
        textarea.value = 'return 1;';
        const recolor = attachHighlighter(textarea);
        const layer = textarea.parentElement!.querySelector('.code-layer')!;
        expect(textarea.parentElement!.classList.contains('code-editor')).toBe(true);
        expect(layer.textContent).toBe('return 1;');

        textarea.value = 'return 2;';
        textarea.dispatchEvent(new Event('input'));
        expect(layer.textContent).toBe('return 2;');

        textarea.value = 'return 3;';
        recolor();
        expect(layer.textContent).toBe('return 3;');
    });
});
