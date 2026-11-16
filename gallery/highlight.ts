/** TypeScript highlighting through highlight.js, limited to the language the gallery shows. */
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';

hljs.registerLanguage('typescript', typescript);

/** Returns escaped, highlighted HTML for a TypeScript snippet. */
export function highlightTypeScript(source: string): string {
    return hljs.highlight(source, { language: 'typescript', ignoreIllegals: true }).value;
}
