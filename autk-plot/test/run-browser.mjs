import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// Tests that draw plots need SVG layout; they run in Chrome, as autk-compute/test/run-webgpu.mjs does.
// All test code is in the repository. Browser state uses an ignored, disposable cache directory.
const root = fileURLToPath(new URL('../../', import.meta.url));
const testDir = resolve(root, 'autk-plot/test');
const harness = resolve(testDir, 'harness.ts');
const chrome = process.env.CHROME_BIN ?? {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
}[process.platform] ?? '/usr/bin/google-chrome';
if (!existsSync(chrome)) throw new Error('Chrome not found; set CHROME_BIN to a Chrome executable.');
// Optional file filter: node autk-plot/test/run-browser.mjs provenance
const filter = process.argv[2] ?? '';
const files = readdirSync(testDir).filter(name => name.endsWith('.browser.ts') && name.includes(filter)).sort();
if (files.length === 0) throw new Error(`No browser tests match "${filter}".`);
await mkdir(resolve(root, '.cache'), { recursive: true });
const profile = await mkdtemp(resolve(root, '.cache/autk-plot-browser-'));
// Test files import Vitest's API from 'vitest'; the harness provides it in the browser.
const vitestApi = {
    name: 'autk-plot-browser-vitest',
    enforce: 'pre',
    resolveId(source, importer) {
        if (source !== 'vitest' || !importer || resolve(importer.split('?')[0]) === harness) return null;
        return harness;
    },
};
// Dependencies are found from the test files at startup, so no page reloads in the middle of a file.
const server = await createServer({ root, configFile: false, logLevel: 'error', plugins: [vitestApi],
    resolve: { alias: { '@urban-toolkit/autk-core': resolve(root, 'autk-core/src/index.ts') } },
    optimizeDeps: { entries: ['autk-plot/test/harness.ts', ...files.map(file => `autk-plot/test/${file}`)] },
    server: { host: '127.0.0.1', port: 0 } });
let browser;
let socket;
let failed = 0;
let passed = 0;
try {
    await server.listen();
    const address = server.httpServer.address();
    browser = spawn(chrome, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--window-size=1280,900',
        '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolveEndpoint, reject) => {
        let logs = '';
        const timeout = setTimeout(() => reject(new Error(`Chrome startup timeout: ${logs}`)), 30000);
        browser.once('error', error => { clearTimeout(timeout); reject(error); });
        browser.once('exit', code => { clearTimeout(timeout); reject(new Error(`Chrome exited (${code}): ${logs}`)); });
        browser.stderr.on('data', data => {
            logs += data.toString();
            const match = logs.match(/DevTools listening on (ws:\/\/\S+)/);
            if (match) { clearTimeout(timeout); resolveEndpoint(match[1]); }
        });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolveOpen, reject) => { socket.addEventListener('open', resolveOpen, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
        const message = JSON.parse(event.data);
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        clearTimeout(request.timeout);
        if (message.error) request.reject(new Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
    });
    function send(method, params = {}, sessionId) {
        return new Promise((resolveResult, reject) => {
            const id = ++sequence;
            const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 120000);
            pending.set(id, { resolve: resolveResult, reject, timeout });
            socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
    }
    // Read the version from the running browser: `chrome --version` opens a window on Windows.
    console.log(`Node ${process.version}; ${(await send('Browser.getVersion')).product}`);
    // One fresh page per file, so files do not share state, as Vitest's workers.
    for (const file of files) {
        const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
        await send('Runtime.enable', {}, sessionId);
        // Evaluate only after navigation so dynamic imports use the project's Vite origin.
        await send('Page.enable', {}, sessionId);
        const loaded = new Promise((resolveLoaded, reject) => {
            const timeout = setTimeout(() => reject(new Error('Page load timeout')), 30000);
            const listener = event => {
                const message = JSON.parse(event.data);
                if (message.method === 'Page.loadEventFired' && message.sessionId === sessionId) {
                    clearTimeout(timeout); socket.removeEventListener('message', listener); resolveLoaded();
                }
            };
            socket.addEventListener('message', listener);
        });
        await send('Page.navigate', { url: `http://127.0.0.1:${address.port}/autk-plot/test/browser.html` }, sessionId);
        await loaded;
        const result = await send('Runtime.evaluate', {
            expression: `import('/autk-plot/test/harness.ts').then(module => module.runFile('/autk-plot/test/${file}'))`,
            awaitPromise: true, returnByValue: true,
        }, sessionId);
        await send('Target.closeTarget', { targetId });
        if (result.exceptionDetails) {
            failed += 1;
            console.log(`✗ ${file}: ${result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails)}`);
            continue;
        }
        const results = result.result.value;
        const fileFailures = results.filter(test => !test.ok);
        passed += results.length - fileFailures.length;
        failed += fileFailures.length;
        console.log(`${fileFailures.length ? '✗' : '✓'} ${file} (${results.length - fileFailures.length}/${results.length})`);
        for (const test of fileFailures) console.log(`  ✗ ${test.name}\n    ${test.error?.split('\n').slice(0, 4).join('\n    ')}`);
    }
    console.log(`\n${passed} passed, ${failed} failed`);
} finally {
    socket?.close();
    if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
        await new Promise(resolveExit => {
            const timeout = setTimeout(() => browser.kill('SIGKILL'), 5000);
            browser.once('exit', () => { clearTimeout(timeout); resolveExit(); });
            browser.kill('SIGTERM');
        });
    }
    await server.close();
    await rm(profile, { recursive: true, force: true });
}
process.exitCode = failed > 0 ? 1 : 0;
