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

/** Indices of the lines the editor bands as what Autark adds. */
function bandsOf(lines: string[]): number[] {
    const host = document.createElement('div');
    host.innerHTML = highlightCode(lines.join('\n'));
    return Array.from(host.querySelectorAll('.code-line')).flatMap((line, index) => (line.classList.contains('autark') ? [index] : []));
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

    test('marks, with no comment, the lines of a built-in chart that use the contract', () => {
        const banded = bandsOf([
            "const { PlotStyle } = autk; // import { PlotStyle } from '@urban-toolkit/autk-plot';",
            'const chart = {',
            "    name: 'chart',",
            "    label: 'Chart',",
            "    design: { rect: { rule: 'glyph' } },",
            '    draw({ group, rows, width }) {',
            '        const x = d3.scaleBand(rows.map(label), [0, width]);',
            "        group.selectAll('rect').data(rows).join('rect')",
            "            .attr('class', 'autkMark')",
            "            .attr('class', 'autk-pie-label');",
            '        // A comment that names autkMark is not code',
            '        return { series: [] };',
            '    },',
            '};',
        ]);
        // The definition's fields, the annotation, and what draw returns; a style class (autk-pie-label) is not part of the contract.
        expect(banded).toEqual([0, 2, 3, 4, 5, 8, 11]);
    });

    test('one rule for both tabs: fields of the definition only, the result, and never a documentation line', () => {
        const banded = bandsOf([
            '/**',
            ' * Rows keep `autkIds`: a documentation line is never banded.',
            ' */',
            'function runIt(rows) {',
            '    const out = rows.map(row => ({',
            "        label: 'x',",
            '        autkIds: row.autkIds,',
            '    }));',
            '    return {',
            '        rows: out,',
            '        provenance: {',
            "            stages: [{ name: 'D1', label: 'points', ids: [] }],",
            '        },',
            '    };',
            '}',
            'const it = {',
            "    name: 'it',",
            "    shape: 'series',",
            '    run: runIt,',
            '};',
        ]);
        // The label of an output row and the names of the stages are plain code; the rows and provenance a run returns are not.
        expect(banded).toEqual([6, 9, 10, 16, 17, 18]);
    });

    test('colors Autark names in code and in strings', () => {
        const host = document.createElement('div');
        host.innerHTML = highlightCode("const { collectBuckets } = autk;\n.attr('class', 'autkMark'); collectBuckets({});");
        // Names read from autk are Autark names wherever the code uses them.
        expect(Array.from(host.querySelectorAll('.tok-autark')).map(t => t.textContent)).toEqual(['collectBuckets', 'autk', 'autkMark', 'collectBuckets']);
        expect(Array.from(host.querySelectorAll('.code-line')).map(line => line.classList.contains('autark'))).toEqual([true, true]);
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
