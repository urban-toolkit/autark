// Generates the built-in templates of Try it Yourself from the package
// sources, so the page offers the very code autk-plot registers: the 24 charts
// (D3 chart tab) and the 12 transforms (Transform tab).
//
// Each built-in plot is a definition in src/plots/*.ts, each built-in
// transform one in src/transforms/presets/*.ts. A template is that module in
// JavaScript (types removed by TypeScript), as the body of the function the
// page evaluates with `d3`, `autk` (this package) and `core`
// (@urban-toolkit/autk-core): imports become reads from those objects, a
// sibling module it reuses is placed before it, and it ends returning the
// definition. Doc comments (`/** … */`) are left out, and the first line links
// the documented source on GitHub; line comments (`//`) stay.
//
// Usage: node usecases/scripts/lab-templates.mjs [src dir] [output file]
// Defaults: autk-plot/src, usecases/src/provenance/lab-builtin-templates.ts. The test
// usecases/test/lab-templates.test.ts fails when the output is not up to date.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(here, '../package.json'));
const ts = require('typescript');

/** Sources of the package on GitHub, where each module has its doc comments. */
const SOURCE_URL = 'https://github.com/urban-toolkit/autark/blob/main/autk-plot/src';

/** Where each kind of built-in lives, and how its template introduces itself. */
const KINDS = {
    plots: {
        registry: 'plots/built-in.ts',
        modules: 'plots',
        prefix: './',
        header: (path) => [
            '// A built-in chart, exactly as autk-plot registers it; its name is the "type" of a plot config.',
            `// With its documentation: ${SOURCE_URL}/${path}`,
        ],
    },
    transforms: {
        registry: 'transforms/built-in.ts',
        modules: 'transforms/presets',
        prefix: './presets/',
        header: (path) => [
            '// A built-in transform, exactly as autk-plot registers it; its name is the "preset" of a transform config.',
            `// With its documentation: ${SOURCE_URL}/${path}`,
        ],
    },
};

/** Lines of a module without its doc comments (`/** … *\/` on lines of their own). */
function withoutDocComments(lines) {
    const kept = [];
    let inDoc = false;
    for (const line of lines) {
        if (inDoc) {
            inDoc = !line.includes('*/');
            continue;
        }
        if (/^\s*\/\*\*/.test(line)) {
            inDoc = !line.includes('*/');
            continue;
        }
        kept.push(line);
    }
    return kept;
}

/** Where an imported module is read from in the page, by its specifier. */
function scopeOf(specifier) {
    if (specifier === 'd3') return 'd3';
    if (specifier === '@urban-toolkit/autk-core') return 'core';
    // Every other module of the package is reached through its public exports.
    return 'autk';
}

/** Import statements of a module: names, specifier, and whether they are types only. */
function importsOf(source) {
    const file = ts.createSourceFile('module.ts', source, ts.ScriptTarget.ES2022, true);
    return file.statements.filter(ts.isImportDeclaration).map(statement => {
        const clause = statement.importClause;
        const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings)
            ? clause.namedBindings.elements.filter(e => !e.isTypeOnly).map(e => e.name.text)
            : [];
        return { specifier: statement.moduleSpecifier.text, names: named, typeOnly: !!clause?.isTypeOnly, namespace: !!clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings) };
    });
}

/** JavaScript of a module, without its imports, exports and doc comments, with blank lines back before comments and declarations. */
function bodyOf(source) {
    const js = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: false },
    }).outputText;
    const lines = withoutDocComments(js.replace(/\r\n/g, '\n').split('\n'))
        .filter(line => !/^import\s/.test(line))
        .map(line => line.replace(/^export (const|function|let) /, '$1 '));
    const out = [];
    for (const line of lines) {
        const previous = out[out.length - 1] ?? '';
        const opens = /^\s*(\/\*\*|\/\/)/.test(line) || /^(const|function|let) /.test(line);
        // A comment stays attached to what it documents; two comment blocks stay apart.
        const endsBlock = /\*\/\s*$/.test(previous);
        const inComment = /^\s*(\*|\/\/|\/\*\*)/.test(previous) && !endsBlock;
        const startsComment = /^\s*(\/\*\*|\/\/)/.test(line);
        // A section divider (`// ---- Runner ----`) stands apart from what follows.
        const divider = /^\/\/ -{4}/.test(previous);
        const attached = !divider && (inComment || (endsBlock && !startsComment));
        if (opens && previous.trim() !== '' && !/[{([,]\s*$/.test(previous) && !attached) out.push('');
        out.push(line);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Value imports of a module turned into reads from the page's scope, with the import a project would write. */
function scopeLines(imports) {
    const lines = [];
    for (const scope of ['autk', 'core']) {
        const names = [...new Set(imports.filter(i => !i.typeOnly && !i.namespace && scopeOf(i.specifier) === scope).flatMap(i => i.names))].sort();
        if (names.length === 0) continue;
        const pkg = scope === 'autk' ? '@urban-toolkit/autk-plot' : '@urban-toolkit/autk-core';
        lines.push(`const { ${names.join(', ')} } = ${scope}; // import { ${names.join(', ')} } from '${pkg}';`);
    }
    return lines;
}

/**
 * Templates of the built-in plots or transforms registered in a `built-in.ts`.
 *
 * @param srcDir Package sources.
 * @param kind `plots` or `transforms`.
 * @returns One entry per registered definition, in registration order: its export, module, and template code.
 */
export function builtInTemplates(srcDir, kind = 'plots') {
    const { registry: registryPath, modules: modulesPath, prefix, header } = KINDS[kind];
    const modules = resolve(srcDir, modulesPath);
    const registry = readFileSync(resolve(srcDir, registryPath), 'utf8');
    const escapedPrefix = prefix.replace(/[./]/g, ch => `\\${ch}`);
    // `import { a, b } from './module';` for every registered definition.
    const moduleOf = new Map();
    for (const [, names, module] of registry.matchAll(new RegExp(`import \\{([^}]+)\\} from '${escapedPrefix}([\\w-]+)';`, 'g'))) {
        for (const name of names.split(',').map(n => n.trim()).filter(Boolean)) moduleOf.set(name, module);
    }
    const registered = /for \(const definition of \[([\s\S]*?)\]\)/.exec(registry)[1].split(',').map(n => n.trim()).filter(Boolean);
    const known = new Set(moduleOf.values());
    /** Sibling module that another one imports (`./scatterplot`, `./binning-1d`), or `null`. */
    const siblingOf = (specifier) => (/^\.\/[\w-]+$/.test(specifier) && known.has(specifier.slice(2)) ? specifier.slice(2) : null);

    return registered.map(exported => {
        const module = moduleOf.get(exported);
        const source = readFileSync(resolve(modules, `${module}.ts`), 'utf8');
        const imports = importsOf(source);
        // A module it reuses (the bubble chart extends the scatterplot) comes first.
        const siblings = imports.filter(i => !i.typeOnly && siblingOf(i.specifier));
        const parts = [];
        const valueImports = imports.filter(i => !siblings.includes(i));
        for (const sibling of siblings) {
            const name = siblingOf(sibling.specifier);
            const siblingSource = readFileSync(resolve(modules, `${name}.ts`), 'utf8');
            valueImports.push(...importsOf(siblingSource).filter(i => !siblingOf(i.specifier)));
            parts.push(`// ---- ${name}.ts, which this one reuses\n\n${bodyOf(siblingSource)}`);
        }
        const lines = [...header(`${modulesPath}/${module}.ts`), ...scopeLines(valueImports)];
        const body = [...parts, `// ---- ${module}.ts\n\n${bodyOf(source)}`].join('\n\n');
        return { exported, module, code: `${lines.join('\n')}\n\n${body}\n\nreturn ${exported};\n` };
    });
}

/** TypeScript module holding the templates of the built-in plots and transforms. */
export function templatesModule(srcDir) {
    const entries = kind => builtInTemplates(srcDir, kind)
        .map(t => `    { exported: ${JSON.stringify(t.exported)}, module: ${JSON.stringify(t.module)}, code: ${JSON.stringify(t.code)} },`)
        .join('\n');
    return `/**
 * Built-in templates of Try it Yourself, generated from the package sources by
 * usecases/scripts/lab-templates.mjs. Do not edit: run
 * \`node usecases/scripts/lab-templates.mjs\` after changing a plot in
 * autk-plot/src/plots or a transform in autk-plot/src/transforms/presets.
 */

/** Code of a built-in plot or transform: the module, in JavaScript, as the body the page evaluates. */
export type BuiltInTemplate = { exported: string; module: string; code: string };

/** One per built-in plot, in the order they are registered. */
export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
${entries('plots')}
];

/** One per built-in transform, in the order they are registered. */
export const BUILT_IN_TRANSFORM_TEMPLATES: BuiltInTemplate[] = [
${entries('transforms')}
];
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const srcDir = resolve(process.argv[2] ?? resolve(here, '../../autk-plot/src'));
    const output = resolve(process.argv[3] ?? resolve(here, '../src/provenance/lab-builtin-templates.ts'));
    writeFileSync(output, templatesModule(srcDir));
    console.log(`${basename(output)}: ${builtInTemplates(srcDir, 'plots').length} plot and ${builtInTemplates(srcDir, 'transforms').length} transform templates`);
}
