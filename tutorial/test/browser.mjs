import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'vite';

const chrome = process.env.CHROME_BIN ?? (process.platform === 'darwin'
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
if (!existsSync(chrome)) throw new Error('Chrome not found; set CHROME_BIN to a WebGPU-enabled Chrome executable.');
const pages = process.argv.slice(2);
if (!pages.length) pages.push('index.html', 'formats.html', 'db.html', 'plot.html', 'compute.html', 'map.html', 'urbane.html');
const profile = await mkdtemp(join(tmpdir(), 'autark-tutorial-'));
const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.mjs', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, open: false },
});
let browser, socket;
const pending = new Map();
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = spawn(chrome, ['--headless=new', '--enable-unsafe-webgpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    let logs = '';
    const timeout = setTimeout(() => reject(new Error(`Chrome startup timeout: ${logs}`)), 15000);
    browser.once('error', error => { clearTimeout(timeout); reject(error); });
    browser.once('exit', code => { clearTimeout(timeout); reject(new Error(`Chrome exited (${code}): ${logs}`)); });
    browser.stderr.on('data', data => {
      logs += data.toString();
      const match = logs.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) { clearTimeout(timeout); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let sequence = 0;
  const errors = [];
  const requests = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent') requests.set(message.params.requestId, message.params.request.url);
    if (message.method === 'Network.loadingFailed') console.error('Request failed:', requests.get(message.params.requestId), message.params.errorText);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') console.error(...message.params.args.map(arg => arg.description ?? arg.value));
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timeout);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  });
  function send(method, params = {}, sessionId) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  for (const page of pages) {
    console.log(`Checking ${page}`);
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Runtime.enable', {}, sessionId);
    await send('Page.enable', {}, sessionId);
    await send('Network.enable', {}, sessionId);
    await send('Network.setBlockedURLs', { urls: ['https://overpass-api.de/*'] }, sessionId);
    await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
    await send('Page.navigate', { url: `${origin}/${page}?overpass=offline` }, sessionId);
    // Wait for Vite's dependency scan and any initial optimizer reload before running cells.
    await delay(2000);
    const readyDeadline = Date.now() + 30000;
    while (!await evaluate(`document.readyState === 'complete' && (${JSON.stringify(page)} === 'index.html' || ${JSON.stringify(page)} === 'urbane.html' || !!document.querySelector('figure.example .run'))`)) {
      assert.ok(Date.now() < readyDeadline, `${page}: runner did not initialize`);
      await delay(250);
    }
    assert.equal(await evaluate('document.querySelectorAll(".site-header").length'), 1);
    assert.equal(await evaluate(`document.querySelectorAll('.site-header a[href^="http"]').length`), 0);
    assert.ok(await evaluate(`document.querySelector('.logo-light').naturalWidth > 0 && document.querySelector('.logo-dark').naturalWidth > 0`));
    for (const dark of [true, false]) {
      await evaluate(`document.querySelector('.theme-toggle').click()`);
      assert.equal(await evaluate(`document.documentElement.classList.contains('dark')`), dark);
      assert.equal(await evaluate(`document.querySelector('.theme-toggle').getAttribute('aria-pressed')`), String(dark));
      assert.equal(await evaluate(`localStorage.getItem('autark-tutorial:theme')`), dark ? 'dark' : 'light');
      if (process.env.TUTORIAL_PREVIEW) {
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
        await writeFile(join(tmpdir(), `autark-${page}-${dark ? 'dark' : 'light'}.png`), Buffer.from(data, 'base64'));
      }
    }
    if (page === 'index.html') {
      await evaluate(`document.querySelector('.theme-toggle').click()`);
      await send('Page.reload', {}, sessionId);
      await delay(1000);
      assert.equal(await evaluate(`document.documentElement.classList.contains('dark')`), true, 'Theme choice must survive reload');
      await evaluate(`document.querySelector('.theme-toggle').click()`);
    }
    if (page !== 'urbane.html') {
      assert.equal(await evaluate(`document.querySelector('nav.toc .series-nav [aria-current="page"]').textContent`), await evaluate(`document.querySelector('nav.toc .series-nav > span').textContent`));
      assert.equal(await evaluate(`document.querySelector('main .series-nav')`), null);
    }
    const count = await evaluate('document.querySelectorAll("figure.example").length');
    for (let index = 0; index < count; index++) {
      const figure = `document.querySelectorAll('figure.example')[${index}]`;
      await evaluate(`${figure}.querySelector('.run').click()`);
      const deadline = Date.now() + 60000;
      let result;
      do {
        await delay(100);
        result = await evaluate(`({ state: ${figure}.querySelector('.state').textContent, title: ${figure}.dataset.title, error: ${figure}.querySelector('.err')?.textContent })`);
        assert.ok(Date.now() < deadline, `${page}: ${result.title} timed out`);
      } while (!result.state || result.state === 'running…');
      assert.ok(result.state.startsWith('done'), `${page}: ${result.title}: ${result.error}`);
      console.log(`  ${result.title}: ${result.state}`);
      if (page === 'map.html' && await evaluate(`!!${figure}.querySelector('.out canvas')`)) {
        await evaluate(`${figure}.querySelector('.out canvas').scrollIntoView({block: 'center', behavior: 'instant'})`);
        await delay(300);
        // Crop controls and branding: a successful cell with an empty canvas must fail this test.
        const clip = await evaluate(`(() => {
          const r = ${figure}.querySelector('.out canvas').getBoundingClientRect();
          return {x: r.left + scrollX + 60, y: r.top + scrollY + 60, width: r.width - 120, height: r.height - 120, scale: 1};
        })()`);
        const { data } = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true }, sessionId);
        const coverage = await evaluate(`(async () => {
          const image = await createImageBitmap(await (await fetch('data:image/png;base64,${data}')).blob());
          const canvas = document.createElement('canvas');
          canvas.width = image.width; canvas.height = image.height;
          const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
          const colors = new Map();
          for (let i = 0; i < pixels.length; i += 4) {
            const color = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
            colors.set(color, (colors.get(color) ?? 0) + 1);
          }
          return 1 - Math.max(...colors.values()) / (pixels.length / 4);
        })()`);
        if (coverage < 0.01) await writeFile(join(tmpdir(), `autark-tutorial-map-${index}.png`), Buffer.from(data, 'base64'));
        assert.ok(coverage > 0.01, `${result.title}: blank map (${(coverage * 100).toFixed(2)}% non-background pixels)`);
        console.log(`    Visible geometry: ${(coverage * 100).toFixed(1)}% non-background pixels`);
      }
    }
    if (page === 'formats.html') {
      // Exercise real CodeMirror edits, saved state, reset, and the serialized Run all above action.
      await evaluate(`document.querySelector('.cm-content').focus()`);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: process.platform === 'darwin' ? 4 : 2, commands: ['selectAll'] }, sessionId);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA' }, sessionId);
      await send('Input.insertText', { text: 'return 42;' }, sessionId);
      await delay(600);
      assert.equal(await evaluate(`JSON.parse(localStorage.getItem('autark-tutorial:formats.html:3.1 · Read a GeoJSON file')).code`), 'return 42;');
      await evaluate(`document.querySelector('figure.example .run').click()`);
      await delay(200);
      assert.equal(await evaluate(`document.querySelector('figure.example .out').textContent`), '42');
      await evaluate(`document.querySelector('figure.example .reset').click()`);
      assert.equal(await evaluate(`localStorage.getItem('autark-tutorial:formats.html:3.1 · Read a GeoJSON file')`), null);
      await evaluate(`document.querySelectorAll('figure.example')[1].querySelector('.all').click()`);
      await delay(500);
      assert.match(await evaluate(`document.querySelector('figure.example .out').textContent`), /FeatureCollection/);
    }
    if (page === 'urbane.html') {
      const deadline = Date.now() + 180000;
      while (!await evaluate('!!window.urbane')) {
        const error = await evaluate(`document.querySelector('#loading-overlay.error')?.textContent`);
        assert.ok(!error, error);
        assert.ok(Date.now() < deadline, 'Urbane initialization timed out');
        console.log(`  ${await evaluate(`document.querySelector('#loading-text').textContent`)}`);
        await delay(5000);
      }
      assert.ok(await evaluate('window.urbane.neighs.features.length > 0'));
      console.log('  Urbane loaded');
      for (const button of ['#weightsCompute', '#levelBtn', '#levelBtn']) {
        if (button === '#levelBtn') await evaluate('window.urbane.state.selected = [0]');
        await evaluate(`document.querySelector(${JSON.stringify(button)}).click()`);
        const interactionDeadline = Date.now() + 30000;
        while (await evaluate(`document.querySelector(${JSON.stringify(button)}).disabled`)) {
          assert.ok(Date.now() < interactionDeadline, `Urbane ${button} timed out`);
          await delay(200);
        }
        if (button === '#levelBtn' && await evaluate('window.urbane.state.level') === 'active_buildings') {
          assert.ok(await evaluate(`window.urbane.db.getLayer('active_buildings').then(layer => layer.features.length > 0)`));
        }
      }
      assert.equal(await evaluate('window.urbane.state.level'), 'neighborhoods');
      console.log('  Urbane score recomputation and drill down/up passed');
    }
    if (process.env.TUTORIAL_PREVIEW && count) {
      await evaluate(`document.querySelector('figure.example').scrollIntoView({block: 'start', behavior: 'instant'})`);
      for (const scheme of ['light', 'dark']) {
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
        await writeFile(join(tmpdir(), `autark-${page}-cell-${scheme}.png`), Buffer.from(data, 'base64'));
        await evaluate(`document.querySelector('.theme-toggle').click()`);
      }
    }
    if (page !== 'urbane.html') {
      await evaluate('window.scrollTo({top: 0, behavior: "instant"})');
      await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, sessionId);
      await delay(300);
      assert.ok(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `${page}: horizontal overflow on mobile`);
      assert.equal(await evaluate(`document.querySelector('.page-outline').open`), false);
      await evaluate(`document.querySelector('.page-outline summary').click()`);
      assert.equal(await evaluate(`document.querySelector('.page-outline').open`), true);
      if (process.env.TUTORIAL_PREVIEW) {
        const { data } = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
        await writeFile(join(tmpdir(), `autark-${page}-mobile.png`), Buffer.from(data, 'base64'));
      }
      await send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      await delay(100);
      assert.equal(await evaluate(`document.querySelector('.page-outline').open`), true);
    }
    assert.deepEqual(errors, [], `${page}: uncaught browser exceptions`);
    await send('Target.closeTarget', { targetId });
  }
  for (const url of requests.values()) {
    if (new URL(url).pathname.includes('/data/')) assert.ok(url.startsWith(`${origin}/data/`), `Dataset outside tutorial: ${url}`);
  }
  console.log('Tutorial browser checks passed.');
} finally {
  for (const request of pending.values()) clearTimeout(request.timeout);
  socket?.close();
  if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
    await new Promise(resolve => {
      const timeout = setTimeout(() => browser.kill('SIGKILL'), 5000);
      browser.once('exit', () => { clearTimeout(timeout); resolve(); });
      browser.kill('SIGTERM');
    });
  }
  await server.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
