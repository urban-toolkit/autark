import { writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import ts from 'typescript';

/** Give relative ESM declaration references the paths Node's TypeScript resolver expects. */
export function writeEsmDeclarationPaths(emittedFiles) {
    for (const [file, text] of emittedFiles) {
        if (!file.endsWith('.d.ts')) continue;
        const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
        const edits = [];
        function visit(node) {
            const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
                ? node.moduleSpecifier
                : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
                    ? node.argument.literal
                    : ts.isModuleDeclaration(node) ? node.name : undefined;
            if (specifier && ts.isStringLiteral(specifier)) {
                const path = specifier.text;
                if ((path === '.' || path === '..' || path.startsWith('./') || path.startsWith('../')) && !extname(path)) {
                    const target = resolve(dirname(file), path);
                    const replacement = emittedFiles.has(`${target}.d.ts`) ? `${path}.js`
                        : emittedFiles.has(resolve(target, 'index.d.ts')) ? `${path.replace(/\/$/, '')}/index.js` : undefined;
                    if (replacement) edits.push({ start: specifier.getStart(source) + 1, end: specifier.end - 1, replacement });
                }
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
        if (!edits.length) continue;
        let updated = text;
        for (const { start, end, replacement } of edits.reverse()) {
            updated = updated.slice(0, start) + replacement + updated.slice(end);
        }
        writeFileSync(file, updated);
    }
}
