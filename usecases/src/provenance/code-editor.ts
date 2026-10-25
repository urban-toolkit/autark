/**
 * Colored code for the Try it Yourself text areas, with no editor library.
 *
 * The text area stays the editor; a highlighted copy of its text is drawn
 * behind it, and the text area's own text is transparent. Lines marked
 * `// Autark` get a band, and Autark names (`lib.…`, `autk…`) their own color,
 * so a developer sees at once what differs from plain D3.
 */

/** Words colored as JavaScript keywords. */
const KEYWORDS = new Set([
    'return', 'const', 'let', 'var', 'function', 'if', 'else', 'for', 'of', 'in', 'new',
    'this', 'true', 'false', 'null', 'undefined', 'typeof', 'while', 'break', 'continue',
]);

/** One token per alternative, tried in order at each position of a line. */
const TOKEN = /(\/\/.*)|(\/\*)|('(?:\\.|[^'\\])*'?|"(?:\\.|[^"\\])*"?|`(?:\\.|[^`\\])*`?)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b)|(\blib\.\w+|\bautk\w*)|(\.\w+)|([A-Za-z_$][\w$]*)/g;

const escape = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (kind: string, text: string): string => `<span class="tok-${kind}">${escape(text)}</span>`;

/** Strings keep their Autark names visible, e.g. `'autkMark'`. */
const stringOf = (text: string): string => `<span class="tok-string">${escape(text).replace(/autk\w*/g, name => `<span class="tok-autark">${name}</span>`)}</span>`;

/** Whether the first comment of a line starts with "Autark" (a comment that only quotes it does not count). */
function isAutarkLine(line: string): boolean {
    const comment = line.indexOf('//');
    return comment >= 0 && /^\/\/\s*Autark\b/.test(line.slice(comment));
}

/**
 * Highlights JavaScript source as HTML, one block per line.
 *
 * @param source Code as typed.
 * @returns HTML with `tok-*` spans; lines marked `// Autark` carry the class `autark`.
 */
export function highlightCode(source: string): string {
    let inBlockComment = false;
    return source.split('\n').map(line => {
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
                html += KEYWORDS.has(word) ? span('keyword', word) : word === 'd3' ? span('d3', word) : escape(word);
            }
            position = match.index + text.length;
        }
        html += escape(line.slice(position));
        return `<span class="code-line${isAutarkLine(line) ? ' autark' : ''}">${html}</span>`;
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
