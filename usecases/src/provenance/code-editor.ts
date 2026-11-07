/**
 * Colored code for the Try it Yourself text areas, with no editor library.
 *
 * The text area stays the editor; a highlighted copy of its text is drawn
 * behind it, and the text area's own text is transparent. One rule, for the
 * examples and the built-in code alike, bands the lines of code that Autark
 * adds to plain D3 or plain JavaScript: the fields of the definition, the
 * annotations of marks and rows, the result a transform returns, and the use
 * of names from Autark; and a line whose comment starts with "Autark". Autark
 * names (`autkMark`, `data-autk-…`, and the names read from `autk` and
 * `core`, such as `collectBuckets`) get their own color.
 */

/** Words colored as JavaScript keywords. */
const KEYWORDS = new Set([
    'return', 'const', 'let', 'var', 'function', 'if', 'else', 'for', 'of', 'in', 'new',
    'this', 'true', 'false', 'null', 'undefined', 'typeof', 'while', 'break', 'continue',
]);

/** One token per alternative, tried in order at each position of a line. */
const TOKEN = /(\/\/.*)|(\/\*)|('(?:\\.|[^'\\])*'?|"(?:\\.|[^"\\])*"?|`(?:\\.|[^`\\])*`?)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b)|(\bautk\w*)|(\.\w+)|([A-Za-z_$][\w$]*)/g;

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (kind: string, text: string): string => `<span class="tok-${kind}">${escape(text)}</span>`;

/** Strings keep their Autark names visible, e.g. `'autkMark'`; style classes (`'autk-pie-label'`) are plain strings. */
const stringOf = (text: string): string => `<span class="tok-string">${escape(text).replace(/\bautk[A-Z]\w*|data-autk-[\w-]*/g, name => `<span class="tok-autark">${name}</span>`)}</span>`;

/** Fields of a plot definition (`PlotDefinition`) and of a transform definition (`TransformDefinition`). */
const DEFINITION_FIELDS = new Set([
    'name', 'label', 'draw', 'drawPart', 'color', 'value', 'design', 'transforms', 'requiresTransform', 'reducers',
    'transformOptions', 'colorDomain', 'colorAttribute', 'markStyle', 'arrange', 'baseColor', 'topK', 'defaults', 'validate',
    'run', 'shape',
]);

/** What a drawing or a transform returns to Autark: the series and design of `draw`, the rows and provenance of `run`. */
const RESULT_FIELDS = new Set(['series', 'design', 'rows', 'provenance']);

/** Key a line starts with (`name: …`, `draw(…) {`), or null. */
const keyOf = (code: string): string | null => code.match(/^\s*([A-Za-z_$][\w$]*)\s*[:(]/)?.[1] ?? null;

/** A documentation or block comment line (`/**`, ` * …`), never banded. */
const isDocLine = (line: string): boolean => /^\s*(\/\*|\*)/.test(line);

/**
 * Names of the contract in code: mark annotations (`autkMark`, `autkContext`,
 * `data-autk-part`…) and the packages (`autk`, read as `autk.x` or
 * `const { … } = autk`, and `core`). Style classes (`autk-pie-label`) are not.
 */
const AUTARK_NAMES = /\bautk[A-Z]\w*|data-autk-|\bautk\b(?![-\w])|=\s*core\s*;/;

/** Names a code reads from the packages: `const { collectBuckets, … } = autk;` (or `= core;`). */
function importedNames(source: string): Set<string> {
    const names = new Set<string>();
    for (const [, list] of source.matchAll(/const\s*\{([^}]*)\}\s*=\s*(?:autk|core)\s*;/g)) {
        for (const name of list.split(',')) {
            const local = name.split(':').pop()!.trim();
            if (/^[A-Za-z_$][\w$]*$/.test(local)) names.add(local);
        }
    }
    return names;
}

/** Code of a line without its comment (a `//` inside a string is kept). */
const codeOf = (line: string): string => line.replace(/('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`)|\/\/.*$/g, (_match, string) => string ?? '');

/**
 * Lines that declare a field of a definition or of a result: a direct key of
 * an object literal that has `draw` or `run` (the definition), or a result
 * key of an object a function returns (`return { rows, provenance }`). Keys of
 * other objects (the rows a transform builds, its stages) are plain code.
 */
function contractLines(lines: string[]): Set<number> {
    const banded = new Set<number>();
    // One frame per open brace: the key lines directly inside it, and whether `return {` opened it.
    const frames: { keys: [number, string][]; returned: boolean }[] = [];
    let inBlockComment = false;
    lines.forEach((line, index) => {
        if (inBlockComment || isDocLine(line)) {
            inBlockComment = (inBlockComment || /^\s*\/\*/.test(line)) && !line.includes('*/');
            return;
        }
        // Strings emptied, so their braces do not count.
        const code = codeOf(line).replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''");
        const key = keyOf(code);
        if (key && frames.length > 0) frames[frames.length - 1].keys.push([index, key]);
        // A one-line result: `return { design: {}, series: [] };`.
        if (/\breturn\s*\{/.test(code) && [...RESULT_FIELDS].some(field => new RegExp(`[{,]\\s*${field}\\s*[:,}]`).test(code))) banded.add(index);
        for (const [position, char] of [...code].entries()) {
            if (char === '{') frames.push({ keys: [], returned: /\breturn\s*$/.test(code.slice(0, position)) });
            if (char !== '}') continue;
            const frame = frames.pop();
            if (!frame) continue;
            const names = frame.keys.map(([, name]) => name);
            if (names.includes('draw') || names.includes('run')) {
                frame.keys.forEach(([at, name]) => { if (DEFINITION_FIELDS.has(name)) banded.add(at); });
            } else if (frame.returned) {
                frame.keys.forEach(([at, name]) => { if (RESULT_FIELDS.has(name)) banded.add(at); });
            }
        }
    });
    return banded;
}

/**
 * Whether a line of code (never a documentation comment) uses Autark: its
 * first comment starts with "Autark" (a comment that only quotes it does not
 * count), or its code uses an Autark name (`autkMark`, `data-autk-…`,
 * `autkIds`, `autk.`, a name read from `autk` or `core`…).
 */
function usesAutark(line: string, imported: Set<string>): boolean {
    if (isDocLine(line)) return false;
    const comment = line.indexOf('//');
    if (comment >= 0 && /^\/\/\s*Autark\b/.test(line.slice(comment))) return true;
    const code = codeOf(line);
    if (AUTARK_NAMES.test(code)) return true;
    return (code.match(/[A-Za-z_$][\w$]*/g) ?? []).some(word => imported.has(word));
}

/**
 * Highlights JavaScript source as HTML, one block per line.
 *
 * @param source Code as typed.
 * @returns HTML with `tok-*` spans; the lines Autark adds carry the class `autark`.
 */
export function highlightCode(source: string): string {
    const imported = importedNames(source);
    const lines = source.split('\n');
    const contract = contractLines(lines);
    let inBlockComment = false;
    return lines.map((line, index) => {
        const banded = contract.has(index) || (!inBlockComment && usesAutark(line, imported));
        let html = '';
        let position = 0;
        if (inBlockComment) {
            const end = line.indexOf('*/');
            const stop = end < 0 ? line.length : end + 2;
            html += span('comment', line.slice(0, stop));
            position = stop;
            inBlockComment = end < 0;
        }
        TOKEN.lastIndex = position;
        for (let match = TOKEN.exec(line); match; match = TOKEN.exec(line)) {
            html += escape(line.slice(position, match.index));
            const [text, comment, blockStart, string, number, autark, property, word] = match;
            if (comment) {
                html += span('comment', comment);
            } else if (blockStart) {
                const end = line.indexOf('*/', match.index + 2);
                const stop = end < 0 ? line.length : end + 2;
                html += span('comment', line.slice(match.index, stop));
                inBlockComment = end < 0;
                TOKEN.lastIndex = stop;
                position = stop;
                continue;
            } else if (string) {
                html += stringOf(string);
            } else if (number) {
                html += span('number', number);
            } else if (autark) {
                html += span('autark', autark);
            } else if (property) {
                html += `.${span('property', property.slice(1))}`;
            } else if (word) {
                html += KEYWORDS.has(word) ? span('keyword', word)
                    : word === 'd3' ? span('d3', word)
                        : imported.has(word) ? span('autark', word) : escape(word);
            }
            position = match.index + text.length;
        }
        html += escape(line.slice(position));
        return `<span class="code-line${banded ? ' autark' : ''}">${html}</span>`;
    }).join('');
}

/**
 * Draws colored code behind a text area and keeps it in sync while typing
 * and scrolling.
 *
 * @param textarea The code text area; it is wrapped in a `.code-editor`.
 * @returns A function that redraws the colors, for code set by a script.
 */
export function attachHighlighter(textarea: HTMLTextAreaElement): () => void {
    const editor = document.createElement('div');
    editor.className = 'code-editor';
    const layer = document.createElement('pre');
    layer.className = 'code-layer';
    layer.setAttribute('aria-hidden', 'true');
    textarea.replaceWith(editor);
    editor.append(layer, textarea);
    textarea.wrap = 'off';

    const sync = () => {
        // The colored copy ends where the text area's scrollbars start, so both scroll the same distance.
        const style = getComputedStyle(textarea);
        const borders = (side: 'Left' | 'Right' | 'Top' | 'Bottom') => parseFloat(style.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0;
        layer.style.right = `${Math.max(0, textarea.offsetWidth - textarea.clientWidth - borders('Left') - borders('Right'))}px`;
        layer.style.bottom = `${Math.max(0, textarea.offsetHeight - textarea.clientHeight - borders('Top') - borders('Bottom'))}px`;
        layer.scrollTop = textarea.scrollTop;
        layer.scrollLeft = textarea.scrollLeft;
    };
    const redraw = () => {
        layer.innerHTML = highlightCode(textarea.value);
        sync();
    };
    textarea.addEventListener('input', redraw);
    textarea.addEventListener('scroll', sync);
    // Scrollbars come and go with the size of the text area (a resized drawer, a phone).
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(sync).observe(textarea);
    redraw();
    return redraw;
}
