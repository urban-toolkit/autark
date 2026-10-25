/**
 * Test registry for the browser runner (run-browser.mjs).
 *
 * The tests that draw plots need a real DOM and SVG layout, so they run in
 * Chrome instead of Vitest's Node workers. They keep Vitest's API: their
 * `import ... from 'vitest'` resolves to this module, which registers
 * `describe`, `test` and the hooks, and re-exports Vitest's own `expect` and
 * `vi` (this file's import of 'vitest' resolves to the real package).
 */

import { expect, vi } from 'vitest';

export { expect, vi };

type Fn = () => unknown;

type TestItem = { kind: 'test'; name: string; fn: Fn };

type Suite = {
    kind: 'suite';
    name: string;
    items: (TestItem | Suite)[];
    beforeAll: Fn[];
    afterAll: Fn[];
    beforeEach: Fn[];
    afterEach: Fn[];
};

/** Result of one test, as the runner prints it. */
export type TestResult = { name: string; ok: boolean; error?: string };

/** Longest a test or hook may take, as Vitest's default. */
const TIMEOUT = 5_000;

const newSuite = (name: string): Suite => ({ kind: 'suite', name, items: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] });

let root = newSuite('');
let current = root;

/** Fills `$key` from an object case and `%s` from any case, as Vitest's `test.each`. */
function title(name: string, testCase: unknown): string {
    let text = name.replace(/%s/g, String(testCase));
    if (testCase && typeof testCase === 'object') {
        text = text.replace(/\$(\w+)/g, (match, key: string) => key in testCase ? String((testCase as Record<string, unknown>)[key]) : match);
    }
    return text;
}

export function describe(name: string, fn: () => void): void {
    const suite = newSuite(name);
    current.items.push(suite);
    const parent = current;
    current = suite;
    try {
        fn();
    } finally {
        current = parent;
    }
}

function register(name: string, fn: Fn): void {
    current.items.push({ kind: 'test', name, fn });
}

export const test = Object.assign(register, {
    each: <T>(cases: readonly T[]) => (name: string, fn: (testCase: T) => unknown) => {
        cases.forEach(testCase => register(title(name, testCase), () => fn(testCase)));
    },
});
export const it = test;

export const beforeAll = (fn: Fn): void => { current.beforeAll.push(fn); };
export const afterAll = (fn: Fn): void => { current.afterAll.push(fn); };
export const beforeEach = (fn: Fn): void => { current.beforeEach.push(fn); };
export const afterEach = (fn: Fn): void => { current.afterEach.push(fn); };

/** Runs a test function or hook, failing it after `TIMEOUT`. */
async function call(fn: Fn): Promise<void> {
    let timer = 0;
    try {
        await Promise.race([
            Promise.resolve().then(fn),
            new Promise((_, reject) => { timer = window.setTimeout(() => reject(new Error(`timed out after ${TIMEOUT} ms`)), TIMEOUT); }),
        ]);
    } finally {
        window.clearTimeout(timer);
    }
}

const describeError = (error: unknown): string => error instanceof Error ? (error.stack ?? error.message) : String(error);

async function runSuite(suite: Suite, path: string[], ancestors: Suite[], results: TestResult[]): Promise<void> {
    const chain = [...ancestors, suite];
    const here = suite.name ? [...path, suite.name] : path;
    try {
        for (const hook of suite.beforeAll) await call(hook);
    } catch (error) {
        results.push({ name: [...here, '(beforeAll)'].join(' > '), ok: false, error: describeError(error) });
        return;
    }
    for (const item of suite.items) {
        if (item.kind === 'suite') {
            await runSuite(item, here, chain, results);
            continue;
        }
        const name = [...here, item.name].join(' > ');
        try {
            for (const level of chain) for (const hook of level.beforeEach) await call(hook);
            await call(item.fn);
            results.push({ name, ok: true });
        } catch (error) {
            results.push({ name, ok: false, error: describeError(error) });
        } finally {
            for (const level of [...chain].reverse()) {
                for (const hook of level.afterEach) {
                    try {
                        await call(hook);
                    } catch (error) {
                        results.push({ name: `${name} (afterEach)`, ok: false, error: describeError(error) });
                    }
                }
            }
        }
    }
    try {
        for (const hook of suite.afterAll) await call(hook);
    } catch (error) {
        results.push({ name: [...here, '(afterAll)'].join(' > '), ok: false, error: describeError(error) });
    }
}

/**
 * Imports one test file, which registers its tests, and runs them in order.
 *
 * @param url Test file URL on the Vite server.
 * @returns One result per test, with the error of each failure.
 */
export async function runFile(url: string): Promise<TestResult[]> {
    root = newSuite('');
    current = root;
    await import(/* @vite-ignore */ url);
    const results: TestResult[] = [];
    await runSuite(root, [], [], results);
    return results;
}
