import * as fs from 'fs';
import * as path from 'path';
import { Page } from '@playwright/test';

const OVERPASS_URL_PATTERN = 'https://overpass-api.de/**';
const MAX_RETRIES = 6;
const BACKOFF_MS = [10_000, 20_000, 45_000, 90_000, 120_000, 180_000];

interface HarHeader { name: string; value: string; }

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: [];
    headers: HarHeader[];
    queryString: [];
    headersSize: number;
    bodySize: number;
    postData?: { mimeType: string; text: string };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: [];
    headers: HarHeader[];
    headersSize: number;
    bodySize: number;
    redirectURL: string;
    content: { size: number; mimeType: string; text: string };
  };
  cache: Record<string, never>;
  timings: { send: number; wait: number; receive: number };
}

/**
 * Routes Overpass API requests through a HAR file.
 *
 * - update: false — playback mode, delegates to page.routeFromHAR().
 * - update: true  — recording mode: retries failed requests until a 2xx
 *   response is received so only successful responses are written to the HAR.
 */
export async function routeOverpassHar(page: Page, harPath: string, update: boolean): Promise<void> {
  if (!update) {
    await page.routeFromHAR(harPath, { url: OVERPASS_URL_PATTERN, update: false });
    return;
  }

  const entries: HarEntry[] = [];
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  await page.route(OVERPASS_URL_PATTERN, async (route) => {
    const request = route.request();
    const startedDateTime = new Date().toISOString();
    const t0 = Date.now();
    let response = await route.fetch();

    for (let attempt = 0; !response.ok() && attempt < MAX_RETRIES; attempt++) {
      const ms = BACKOFF_MS[attempt] ?? 180_000;
      console.warn(
        `[har-recorder] Overpass ${response.status()} — attempt ${attempt + 1}/${MAX_RETRIES}, ` +
        `retrying in ${ms / 1000}s…`,
      );
      await wait(ms);
      response = await route.fetch();
    }

    const elapsed = Date.now() - t0;
    const body = await response.text();
    const mimeType = response.headers()['content-type'] ?? 'application/json';
    const postData = request.postData();

    entries.push({
      startedDateTime,
      time: elapsed,
      request: {
        method: request.method(),
        url: request.url(),
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: Object.entries(request.headers()).map(([name, value]) => ({ name, value })),
        queryString: [],
        headersSize: -1,
        bodySize: -1,
        ...(postData ? { postData: { mimeType: 'application/x-www-form-urlencoded', text: postData } } : {}),
      },
      response: {
        status: response.status(),
        statusText: response.statusText(),
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: Object.entries(response.headers()).map(([name, value]) => ({ name, value })),
        headersSize: -1,
        bodySize: -1,
        redirectURL: '',
        content: { size: body.length, mimeType, text: body },
      },
      cache: {},
      timings: { send: -1, wait: -1, receive: elapsed },
    });

    await route.fulfill({ response });
  });

  page.on('close', () => {
    const har = { log: { version: '1.2', creator: { name: 'autk-tests', version: '1.0' }, entries } };
    fs.mkdirSync(path.dirname(harPath), { recursive: true });
    fs.writeFileSync(harPath, JSON.stringify(har, null, 2));
    console.log(`[har-recorder] Saved ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} to ${harPath}`);
  });
}
