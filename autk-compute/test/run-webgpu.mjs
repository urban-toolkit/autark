import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import glsl from 'vite-plugin-glsl';

// All test code is in the repository. Browser state uses an ignored, disposable cache directory.
const root = fileURLToPath(new URL('../../', import.meta.url));
const chrome = process.env.CHROME_BIN ?? (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
if (!existsSync(chrome)) throw new Error('Chrome not found; set CHROME_BIN to a WebGPU-enabled Chrome executable.');
console.log(`Node ${process.version}; ${execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim()}`);
await mkdir(resolve(root, '.cache'), { recursive: true });
const profile = await mkdtemp(resolve(root, '.cache/autk-webgpu-'));
const server = await createServer({ root, configFile: false, plugins: [glsl()],
    resolve: { alias: { '@urban-toolkit/autk-core': resolve(root, 'autk-core/src/index.ts') } },
    server: { host: '127.0.0.1', port: 0 } });
let browser;
let socket;
try {
    await server.listen();
    const address = server.httpServer.address();
    browser = spawn(chrome, ['--headless=new', '--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check',
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
            const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
            pending.set(id, { resolve: resolveResult, reject, timeout });
            socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
    }
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
    await send('Page.navigate', { url: `http://127.0.0.1:${address.port}/autk-compute/test/webgpu.html` }, sessionId);
    await loaded;
    const result = await send('Runtime.evaluate', {
        expression: "import('/autk-compute/test/webgpu-cases.ts').then(module => module.runWebGpuCases())",
        awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails));
    console.log(JSON.stringify(result.result.value, null, 2));
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
